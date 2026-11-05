import { randomBytes, randomInt } from "node:crypto";
import { ActionError, type SessionUser } from "./auth";
import { asSystem, type Db } from "./db";
import { appUrl } from "./email";
import { notify } from "./notify";
import { getProvider } from "./payments/providers";
import { beginPayment, grantMonthlyCredits, newReference } from "./payments/settle";
import { commissionBps, getSetting } from "./settings";

const orderNumber = () => `CP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

export type CheckoutInput = {
  paymentMethod: "online" | "pay_on_pickup"; provider?: string | null; pickupPoint: string; note?: string | null;
  coupon?: string | null;
};

/** Prices come from the database at this moment. Nothing about price is accepted from the browser. */
export async function placeOrders(user: SessionUser, input: CheckoutInput) {
  if (!user.email_verified_at) throw new ActionError("Verify your email before placing an order.");
  if (user.status !== "active") throw new ActionError("Your account can't place orders right now.");

  if (input.paymentMethod === "online") getProvider(input.provider ?? "");
  const reference = newReference("ORD");
  const result = await asSystem(async (db) => {
    if (input.paymentMethod === "pay_on_pickup" && !(await getSetting(db, "pay_on_pickup_enabled", true)))
      throw new ActionError("Pay at pickup is switched off.");
    const lines = await db.rows(
      `select c.quantity, l.id, l.title, l.kind, l.effective_price_kobo, l.storefront_id, l.stock, l.price_type, l.in_stock, s.owner_id
       from cart_items c join listing_cards l on l.id = c.listing_id join storefronts s on s.id = l.storefront_id
       where c.user_id = $1 and l.status = 'active' and s.status = 'active'`, [user.id]);
    const cartCount = await db.one("select count(*)::int as n from cart_items where user_id=$1", [user.id]);
    if (!lines.length) throw new ActionError("Your cart is empty.");
    if (lines.length !== cartCount.n) throw new ActionError("Something in your cart is no longer available. Review your cart and try again.");

    const stores = new Map<string, any[]>();
    for (const l of lines) {
      if (l.owner_id === user.id) throw new ActionError("You can't order from your own storefront.");
      if (l.price_type === "starting_from") throw new ActionError(`Agree a price for "${l.title}" with the seller first.`);
      stores.set(l.storefront_id, [...(stores.get(l.storefront_id) ?? []), l]);
    }

    let grandTotal = 0;
    const orderIds: { id: string; total: number; storefront_id: string }[] = [];
    let txId: string | null = null;
    if (input.paymentMethod === "online") {
      const provisional = await db.one(
        "insert into transactions(reference, user_id, purpose, provider, amount_kobo) values ($1,$2,'order',$3,1) returning id",
        [reference, user.id, input.provider]);
      txId = provisional.id;
    }
    let couponUsed = false;
    for (const [storefrontId, items] of stores) {
      for (const it of items) {
        if (it.kind === "product") {
          const ok = await db.run("update products set stock = stock - $2 where listing_id = $1 and stock >= $2", [it.id, it.quantity]);
          if (!ok) throw new ActionError(`Only ${it.stock} of "${it.title}" left. Update your cart.`);
        } else if (!it.in_stock) throw new ActionError(`"${it.title}" isn't taking bookings right now.`);
      }
      const subtotal = items.reduce((s, i) => s + Number(i.effective_price_kobo) * i.quantity, 0);
      let discount = 0; let couponId: string | null = null;
      if (input.coupon) {
        const code = await db.one(
          `select dc.* from discount_codes dc join storefronts s on s.id = dc.storefront_id
           where dc.storefront_id=$1 and dc.code=$2 and dc.is_active and (dc.expires_at is null or dc.expires_at > now())
             and (dc.max_uses is null or dc.used_count < dc.max_uses)
             and (effective_plan(s.owner_id)).coupons_enabled for update of dc`, [storefrontId, input.coupon.toUpperCase()]);
        if (code) {
          discount = Math.floor(subtotal * code.percent_off / 100);
          couponId = code.id; couponUsed = true;
          await db.run("update discount_codes set used_count = used_count + 1 where id=$1", [code.id]);
        }
      }
      const total = subtotal - discount;
      grandTotal += total;
      const paymentStatus = input.paymentMethod === "online" ? "awaiting_payment" : "pay_on_pickup";
      const order = await db.one(
        `insert into orders(number,buyer_id,storefront_id,payment_method,payment_status,subtotal_kobo,discount_kobo,total_kobo,
           pickup_point,buyer_note,pickup_code,transaction_id,discount_code_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, number`,
        [orderNumber(), user.id, storefrontId, input.paymentMethod, paymentStatus, subtotal, discount, total,
         input.pickupPoint, input.note ?? null, String(randomInt(100000, 999999)), txId, couponId]);
      for (const it of items) {
        await db.run("insert into order_items(order_id,listing_id,title,unit_price_kobo,quantity) values ($1,$2,$3,$4,$5)",
          [order.id, it.id, it.title, it.effective_price_kobo, it.quantity]);
      }
      await db.run("insert into order_events(order_id,status,actor_id,note) values ($1,'pending',$2,'Order placed')", [order.id, user.id]);
      if (input.paymentMethod === "pay_on_pickup") {
        await notify(db, items[0].owner_id, `New order ${order.number}`, "Accept or reject it from your orders page.", `/seller/orders/${order.id}`);
      }
      orderIds.push({ id: order.id, total, storefront_id: storefrontId });
    }
    if (input.coupon && !couponUsed) throw new ActionError("That discount code isn't valid for the items in your cart.");
    if (txId) {
      if (grandTotal <= 0) throw new ActionError("This order total can't be paid online.");
      await db.run("update transactions set amount_kobo=$2 where id=$1", [txId, grandTotal]);
    }
    await db.run("delete from cart_items where user_id=$1", [user.id]);
    return { orderIds, grandTotal, txId };
  });

  if (input.paymentMethod === "online") {
    try {
      const provider = getProvider(input.provider ?? "");
      const url = await provider.initialize({
        reference, amountKobo: result.grandTotal, email: user.email,
        callbackUrl: appUrl(`/payments/callback?reference=${reference}`),
      });
      return { ...result, paymentUrl: url };
    } catch (e) {
      await cancelUnpaid(result.txId!);
      throw e;
    }
  }
  return { ...result, paymentUrl: null };
}

async function restock(db: Db, orderId: string) {
  await db.run(
    `update products p set stock = p.stock + i.quantity from order_items i
     where i.order_id=$1 and i.listing_id=p.listing_id`, [orderId]);
}

export async function cancelUnpaid(txId: string) {
  await asSystem(async (db) => {
    const orders = await db.rows("select id from orders where transaction_id=$1 and payment_status='awaiting_payment'", [txId]);
    for (const o of orders) {
      await db.run("update orders set status='cancelled', payment_status='failed' where id=$1", [o.id]);
      await db.run("insert into order_events(order_id,status,note) values ($1,'cancelled','Payment was not completed')", [o.id]);
      await restock(db, o.id);
    }
    await db.run("update transactions set status='failed' where id=$1 and status='initiated'", [txId]);
  });
}

const SELLER_NEXT: Record<string, string[]> = {
  pending: ["accepted", "cancelled"], accepted: ["processing", "ready_for_pickup", "cancelled"],
  processing: ["ready_for_pickup", "cancelled"], ready_for_pickup: ["completed", "cancelled"],
};

/** Every order status change, by seller or buyer, goes through here. */
export async function changeOrderStatus(actor: SessionUser, orderId: string, next: string, opts: { note?: string | null; code?: string | null } = {}) {
  await asSystem(async (db) => {
    const o = await db.one(
      `select o.*, s.owner_id, s.name as store_name from orders o join storefronts s on s.id=o.storefront_id where o.id=$1 for update of o`, [orderId]);
    if (!o) throw new ActionError("Order not found.");
    const isSeller = o.owner_id === actor.id;
    const isBuyer = o.buyer_id === actor.id;
    if (!isSeller && !isBuyer) throw new ActionError("You don't have access to this order.");
    if (isBuyer && !isSeller && !(next === "cancelled" && o.status === "pending"))
      throw new ActionError("You can only cancel an order before the seller accepts it.");
    if (isSeller && !SELLER_NEXT[o.status]?.includes(next)) throw new ActionError("That status change isn't allowed.");
    if (o.payment_status === "awaiting_payment" && next !== "cancelled") throw new ActionError("This order hasn't been paid yet.");
    if (next === "completed" && opts.code?.trim() !== o.pickup_code)
      throw new ActionError("That pickup code doesn't match. Ask the buyer for the code on their order page.");

    await db.run("update orders set status=$2 where id=$1", [orderId, next]);
    await db.run("insert into order_events(order_id,status,actor_id,note) values ($1,$2,$3,$4)", [orderId, next, actor.id, opts.note ?? null]);

    if (next === "cancelled") {
      await restock(db, orderId);
      if (o.payment_status === "paid") {
        await db.run("insert into refunds(order_id, transaction_id, amount_kobo, reason) values ($1,$2,$3,$4)",
          [orderId, o.transaction_id, o.total_kobo, opts.note || "Order cancelled after payment"]);
      }
    }
    if (next === "completed") {
      await db.run(
        `update listings l set sold_count = sold_count + i.quantity from order_items i where i.order_id=$1 and i.listing_id=l.id`, [orderId]);
      if (o.payment_status === "pay_on_pickup") {
        await db.run("update orders set payment_status='collected' where id=$1", [orderId]);
      } else if (o.payment_status === "paid") {
        const bps = await commissionBps(db);
        const fee = Math.round(Number(o.total_kobo) * bps / 10000);
        await db.run(
          "insert into commissions(order_id,storefront_id,rate_bps,gross_kobo,commission_kobo,net_kobo) values ($1,$2,$3,$4,$5,$6)",
          [orderId, o.storefront_id, bps, o.total_kobo, fee, Number(o.total_kobo) - fee]);
      }
    }
    const label = next.replace(/_/g, " ");
    if (isSeller) await notify(db, o.buyer_id, `Order ${o.number}: ${label}`, `${o.store_name} updated your order.`, `/account/orders/${orderId}`);
    else await notify(db, o.owner_id, `Order ${o.number} was ${label}`, "The buyer cancelled this order.", `/seller/orders/${orderId}`);
  });
}

/** Expired subscriptions, boosts and abandoned payments. Called by the daily cron route. */
export async function runSweep() {
  const unpaid = await asSystem((db) => db.rows(
    "select id from transactions where status='initiated' and purpose='order' and created_at < now() - interval '1 hour'"));
  for (const t of unpaid) await cancelUnpaid(t.id);
  return asSystem(async (db) => {
    const boosts = await db.run("update store_boosts set status='ended' where status='active' and ends_at <= now()");
    const expired = await db.rows(
      `update subscriptions set status='expired' where status='active' and expires_at <= now() returning seller_id, next_plan_id`);
    const free = await db.one("select id from subscription_plans order by sort limit 1");
    for (const s of expired) {
      await db.run("insert into subscriptions(seller_id, plan_id) values ($1,$2)", [s.seller_id, free.id]);
      await notify(db, s.seller_id, "Your plan ended", "You're back on the free plan. Listings above its limit were made inactive.", "/seller/billing");
    }
    // Anyone over their limit loses their oldest active listings first, whatever caused it.
    const over = await db.rows(
      `with c as (
         select l.id, row_number() over (partition by l.storefront_id order by l.created_at desc) rn,
                (effective_plan(s.owner_id)).listing_limit lim
         from listings l join storefronts s on s.id=l.storefront_id where l.status in ('active','pending_review'))
       update listings set status='inactive' where id in (select id from c where rn > lim) returning id`);
    const sellers = await db.rows(`select seller_id from subscriptions where status='active'`);
    for (const s of sellers) {
      await grantMonthlyCredits(db, s.seller_id);
    }
    return { abandonedPayments: unpaid.length, boostsEnded: boosts, plansExpired: expired.length, listingsDeactivated: over.length };
  });
}

export { beginPayment };
