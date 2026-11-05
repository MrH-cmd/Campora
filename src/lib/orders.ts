import { randomBytes, randomInt } from "node:crypto";
import { ActionError, type SessionUser } from "./auth";
import { asSystem, type Db } from "./db";
import { appUrl, emailEnabled } from "./email";
import { emailUser, ledger, notify } from "./notify";
import { commissionFor, quote } from "./pricing";
import { processReferral } from "./referrals";
import { expireLots, lockWallet, reverseRedemption, spendWallet } from "./wallet";
import { runDeletions } from "./deletion";
import { getProvider } from "./payments/providers";
import { beginPayment, grantMonthlyCredits, newReference } from "./payments/settle";
import { getSetting } from "./settings";

const orderNumber = () => `CP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

export type CheckoutInput = {
  paymentMethod: "online" | "pay_on_pickup"; provider?: string | null; pickupPoint?: string; pickups: Record<string, string>; note?: string | null;
  coupon?: string | null; useCredit?: boolean;
};

/** Every amount is recalculated here at order time. Nothing about price is accepted from the browser. */
export async function placeOrders(user: SessionUser, input: CheckoutInput) {
  if (emailEnabled() && !user.email_verified_at) throw new ActionError("Verify your email before placing an order.");
  if (user.status !== "active") throw new ActionError("Your account can't place orders right now.");
  const online = input.paymentMethod === "online";
  if (online) getProvider(input.provider ?? "");
  const reference = newReference("ORD");

  const result = await asSystem(async (db) => {
    if (!online && !(await getSetting(db, "pay_on_pickup_enabled", true))) throw new ActionError("Pay at pickup is switched off.");
    await lockWallet(db, user.id);
    const cartCount = await db.one("select count(*)::int as n from cart_items where user_id=$1", [user.id]);
    if (!cartCount.n) throw new ActionError("Your cart is empty.");
    const q0 = await quote(db, user, { code: input.coupon, useCredit: input.useCredit, online });
    // Lock campaigns, then price again so two people can't take the last redemption at once.
    const ids = [...new Set(q0.stores.flatMap((s) => s.allocations.map((a) => a.campaignId)))];
    if (ids.length) await db.rows("select id from discount_campaigns where id = any($1) order by id for update", [ids]);
    const q = await quote(db, user, { code: input.coupon, useCredit: input.useCredit, online });
    const lineCount = q.stores.reduce((a, s) => a + s.lines.length, 0);
    if (lineCount !== cartCount.n) throw new ActionError("Something in your cart is no longer available. Review your cart and try again.");
    if (input.coupon && !q.codeValid) throw new ActionError(q.codeMessage ?? "That code isn't valid.");
    if (online && q.totalKobo <= 0) throw new ActionError("This order total can't be paid online.");

    let txId: string | null = null;
    if (online) txId = (await db.one(
      "insert into transactions(reference, user_id, purpose, provider, amount_kobo) values ($1,$2,'order',$3,$4) returning id",
      [reference, user.id, input.provider, q.totalKobo])).id;

    const orderIds: { id: string; total: number; storefront_id: string }[] = [];
    for (const s of q.stores) {
      for (const it of s.lines) {
        if (it.owner_id === user.id) throw new ActionError("You can't order from your own storefront.");
        if (it.price_type === "starting_from") throw new ActionError(`Agree a price for "${it.title}" with the seller first.`);
        if (it.kind === "product") {
          const ok = await db.run("update products set stock = stock - $2 where listing_id = $1 and stock >= $2", [it.id, it.quantity]);
          if (!ok) throw new ActionError(`Only ${it.stock} of "${it.title}" left. Update your cart.`);
        } else if (!it.in_stock) throw new ActionError(`"${it.title}" isn't taking bookings right now.`);
      }
      const pick = input.pickups[s.storefront_id] ?? input.pickupPoint;
      if (!pick) throw new ActionError(`Choose a pickup point for ${s.store_name}.`);
      const option = await db.one("select * from storefront_pickup_points where storefront_id=$1 and name=$2 and is_active", [s.storefront_id, pick]);
      const sellerFunded = s.couponKobo + s.campaignSellerKobo;
      const hasService = s.lines.some((l) => l.kind === "service");
      const order = await db.one(
        `insert into orders(number,buyer_id,storefront_id,payment_method,payment_status,subtotal_kobo,discount_kobo,campaign_discount_kobo,wallet_credit_kobo,seller_funded_kobo,platform_funded_kobo,total_kobo,
           pickup_point,pickup_instructions,pickup_window,buyer_note,pickup_code,transaction_id,discount_code_id,service_stage)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id, number`,
        [orderNumber(), user.id, s.storefront_id, input.paymentMethod, online ? "awaiting_payment" : "pay_on_pickup", s.subtotalKobo, s.couponKobo, s.campaignKobo, s.creditKobo, sellerFunded, s.campaignPlatformKobo, s.totalKobo,
         pick, option?.instructions ?? null, option?.time_window ?? null, input.note ?? null, String(randomInt(100000, 999999)), txId, s.couponId, hasService ? "Order received" : null]);
      for (const it of s.lines) await db.run(
        "insert into order_items(order_id,listing_id,title,unit_price_kobo,quantity,category_id,kind) values ($1,$2,$3,$4,$5,$6,$7)",
        [order.id, it.id, it.title, it.unit, it.quantity, it.category_id, it.kind]);
      await db.run("insert into order_events(order_id,status,actor_id,note) values ($1,'pending',$2,'Order placed')", [order.id, user.id]);
      if (hasService) await db.run("insert into service_updates(order_id,stage,note,created_by) values ($1,'Order received',null,$2)", [order.id, user.id]);
      if (s.couponId) await db.run("update discount_codes set used_count = used_count + 1 where id=$1", [s.couponId]);
      for (const a of s.allocations) await db.run(
        "insert into discount_redemptions(campaign_id,user_id,order_id,discount_kobo,seller_funded_kobo,platform_funded_kobo,status) values ($1,$2,$3,$4,$5,$6,$7)",
        [a.campaignId, user.id, order.id, a.kobo, a.seller, a.platform, online ? "reserved" : "confirmed"]);
      if (s.creditKobo) await spendWallet(db, { userId: user.id, amountKobo: s.creditKobo, reference: `redeem:${order.id}`, description: `Used on order ${order.number}`, orderId: order.id });
      if (!online) await notify(db, s.lines[0].owner_id, `New order ${order.number}`, "Accept or reject it from your orders page.", `/seller/orders/${order.id}`);
      orderIds.push({ id: order.id, total: s.totalKobo, storefront_id: s.storefront_id });
    }
    await db.run("delete from cart_items where user_id=$1", [user.id]);
    return { orderIds, grandTotal: q.totalKobo, txId };
  });

  if (online) {
    try {
      const url = await getProvider(input.provider ?? "").initialize({
        reference, amountKobo: result.grandTotal, email: user.email, callbackUrl: appUrl(`/payments/callback?reference=${reference}`),
      });
      return { ...result, paymentUrl: url };
    } catch (e) {
      await cancelUnpaid(result.txId!);
      throw e;
    }
  }
  return { ...result, paymentUrl: null };
}

/** Gives back everything an abandoned, failed or cancelled order had reserved. Safe to run twice. */
export async function releaseOrder(db: Db, orderId: string) {
  const o = await db.one("select discount_code_id from orders where id=$1", [orderId]);
  const released = await db.run("update discount_redemptions set status='released' where order_id=$1 and status<>'released'", [orderId]);
  if (o?.discount_code_id && (released || !(await db.one("select 1 from discount_redemptions where order_id=$1", [orderId])))) {
    const once = await db.run("update orders set discount_code_id=null where id=$1", [orderId]);
    if (once) await db.run("update discount_codes set used_count=greatest(used_count-1,0) where id=$1", [o.discount_code_id]);
  }
  await reverseRedemption(db, orderId);
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
      await releaseOrder(db, o.id);
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
      if (o.payment_status !== "paid") await releaseOrder(db, orderId);
      await db.run("update service_locations set is_sharing=false where order_id=$1", [orderId]);
      if (o.payment_status === "paid") {
        await db.run("insert into refunds(order_id, transaction_id, amount_kobo, reason) values ($1,$2,$3,$4)",
          [orderId, o.transaction_id, o.total_kobo, opts.note || "Order cancelled after payment"]);
      }
    }
    if (next === "completed") {
      await db.run(
        `update listings l set sold_count = sold_count + i.quantity from order_items i where i.order_id=$1 and i.listing_id=l.id`, [orderId]);
      await db.run("update service_locations set is_sharing=false where order_id=$1", [orderId]);
      const c = await commissionFor(db, o);
      const cash = o.payment_status === "pay_on_pickup";
      if (cash) await db.run("update orders set payment_status='collected' where id=$1", [orderId]);
      if (cash || o.payment_status === "paid") {
        for (const r of c.rows) await db.run("update order_items set commission_bps=$2, commission_kobo=$3 where id=$1", [r.id, r.bps, r.kobo]);
        await db.run(
          "insert into commissions(order_id,storefront_id,rate_bps,gross_kobo,eligible_kobo,commission_kobo,net_kobo,status) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (order_id) do nothing",
          [orderId, o.storefront_id, c.rateBps, c.gross, c.eligible, c.fee, c.net, cash ? "owed" : "earned"]);
        await ledger(db, `commission:${orderId}`, "commission", c.fee, { orderId, storefrontId: o.storefront_id, memo: cash ? "Owed by seller on a cash order" : "Deducted from seller earnings" });
        if (!cash) await ledger(db, `seller-earning:${orderId}`, "seller_earning", c.net, { orderId, storefrontId: o.storefront_id });
        if (Number(o.platform_funded_kobo) + Number(o.wallet_credit_kobo) > 0)
          await ledger(db, `promo-cost:${orderId}`, "platform_promo_cost", Number(o.platform_funded_kobo) + Number(o.wallet_credit_kobo), { orderId, storefrontId: o.storefront_id });
      }
      await processReferral(db, { ...o, payment_status: cash ? "collected" : o.payment_status });
    }
    const label = next.replace(/_/g, " ");
    if (isSeller) await notify(db, o.buyer_id, `Order ${o.number}: ${label}`, `${o.store_name} updated your order.`, `/account/orders/${orderId}`);
    else await notify(db, o.owner_id, `Order ${o.number} was ${label}`, "The buyer cancelled this order.", `/seller/orders/${orderId}`);
    return { buyer: o.buyer_id as string, number: o.number as string, store: o.store_name as string, label };
  }).then((m) => emailUser(m.buyer, `Order ${m.number}: ${m.label}`, `${m.store} updated your order.\n\n${appUrl(`/account/orders/${orderId}`)}`));
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
    await expireLots(db);
    await db.run(
      `update referrals r set status='expired' where status='pending_purchase' and registered_at < now() - interval '180 days'`);
    const sellers = await db.rows(`select seller_id from subscriptions where status='active'`);
    for (const s of sellers) {
      await grantMonthlyCredits(db, s.seller_id);
    }
    const deleted = await runDeletions(db);
    return { accountsDeleted: deleted, abandonedPayments: unpaid.length, boostsEnded: boosts, plansExpired: expired.length, listingsDeactivated: over.length };
  });
}

export { beginPayment };
