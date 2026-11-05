import { randomBytes } from "node:crypto";
import { ActionError } from "../auth";
import { asSystem, type Db } from "../db";
import { appUrl } from "../email";
import { ledger, notify } from "../notify";
import { releaseOrder } from "../orders";
import { getProvider, providers, type ProviderName } from "./providers";

export const newReference = (prefix: string) => `CMP-${prefix}-${randomBytes(9).toString("hex")}`;

/** Records a transaction, then asks the provider for a hosted payment page. */
export async function beginPayment(opts: {
  userId: string; email: string; purpose: "order" | "subscription" | "boost"; provider: string; amountKobo: number; meta?: object; db?: Db; reference?: string;
}) {
  const provider = getProvider(opts.provider);
  const reference = opts.reference ?? newReference(opts.purpose.slice(0, 3).toUpperCase());
  const insert = (db: Db) => db.run(
    "insert into transactions(reference, user_id, purpose, provider, amount_kobo, meta) values ($1,$2,$3,$4,$5,$6)",
    [reference, opts.userId, opts.purpose, provider.name, opts.amountKobo, opts.meta ?? {}]);
  await (opts.db ? insert(opts.db) : asSystem(insert));
  const url = await provider.initialize({
    reference, amountKobo: opts.amountKobo, email: opts.email, callbackUrl: appUrl(`/payments/callback?reference=${reference}`),
  });
  return { reference, url };
}

/**
 * The only path that marks money as received. It always asks the provider directly, checks the amount
 * and currency against our record, and is safe to call repeatedly from the callback and webhook.
 */
export async function settleTransaction(reference: string) {
  const tx = await asSystem((db) => db.one("select * from transactions where reference = $1", [reference]));
  if (!tx) throw new ActionError("Payment not found.");
  if (tx.status === "success") return tx;
  const provider = providers[tx.provider as ProviderName];
  const verified = await provider.verify(reference);
  const good = verified.status === "success" && verified.amountKobo === Number(tx.amount_kobo) && verified.currency === tx.currency;
  if (verified.status === "pending") return tx;
  return asSystem(async (db) => {
    const locked = await db.one("select * from transactions where reference = $1 for update", [reference]);
    if (locked.status !== "initiated") return locked;
    if (!good) {
      await db.run("update transactions set status='failed', provider_reference=$2, meta = meta || $3 where id=$1",
        [tx.id, verified.providerReference, { verified_amount_kobo: verified.amountKobo, verified_currency: verified.currency }]);
      const failed = await db.rows("select id from orders where transaction_id=$1 and payment_status='awaiting_payment'", [tx.id]);
      for (const o of failed) {
        await db.run("update orders set status='cancelled', payment_status='failed' where id=$1", [o.id]);
        await db.run("insert into order_events(order_id,status,note) values ($1,'cancelled','Payment could not be verified')", [o.id]);
        await db.run("update products p set stock=p.stock+i.quantity from order_items i where i.order_id=$1 and i.listing_id=p.listing_id", [o.id]);
        await releaseOrder(db, o.id);
      }
      return { ...locked, status: "failed" };
    }
    await db.run("update transactions set status='success', provider_reference=$2, verified_at=now() where id=$1", [tx.id, verified.providerReference]);
    await applyPaidEffect(db, tx);
    return { ...locked, status: "success" };
  });
}

async function applyPaidEffect(db: Db, tx: any) {
  if (tx.purpose === "order") {
    const orders = await db.rows(
      `update orders o set payment_status='paid' from storefronts s
       where o.transaction_id=$1 and s.id=o.storefront_id returning o.id, o.number, s.owner_id`, [tx.id]);
    for (const o of orders) {
      await db.run("update discount_redemptions set status='confirmed' where order_id=$1 and status='reserved'", [o.id]);
      await notify(db, o.owner_id, `New paid order ${o.number}`, "Accept it to start preparing.", `/seller/orders/${o.id}`);
    }
    await ledger(db, `payment:${tx.reference}`, "payment_captured", Number(tx.amount_kobo), { transactionId: tx.id });
    await db.run(`update referrals set status='awaiting_completion' where referred_user_id=$1 and status='pending_purchase'`, [tx.user_id]);
    await notify(db, tx.user_id, "Payment confirmed", `We received ₦${(Number(tx.amount_kobo) / 100).toLocaleString("en-NG")}.`, "/account/orders");
  } else if (tx.purpose === "subscription") {
    await ledger(db, `payment:${tx.reference}`, "subscription_income", Number(tx.amount_kobo), { transactionId: tx.id });
    await activatePlan(db, tx.user_id, tx.meta.plan_id, tx.id);
  } else if (tx.purpose === "boost") {
    await ledger(db, `payment:${tx.reference}`, "boost_income", Number(tx.amount_kobo), { transactionId: tx.id });
    await db.run(
      `update store_boosts b set status='active', starts_at=now(), ends_at=now() + make_interval(days => p.duration_days)
       from boost_packages p where b.id=$1 and p.id=b.package_id and b.status='pending_payment'`, [tx.meta.boost_id]);
    await notify(db, tx.user_id, "Your boost is live", null, "/seller/boosts");
  }
}

export async function activatePlan(db: Db, sellerId: string, planId: string, txId: string | null) {
  const current = await db.one(
    "select * from subscriptions where seller_id=$1 and status='active' for update", [sellerId]);
  const stillRunning = current?.plan_id === planId && current?.expires_at && new Date(current.expires_at) > new Date();
  const from = stillRunning ? new Date(current.expires_at) : new Date();
  const expires = new Date(from.getTime() + 30 * 86400_000);
  if (current) await db.run("update subscriptions set status='replaced' where id=$1", [current.id]);
  await db.run("insert into subscriptions(seller_id, plan_id, expires_at, transaction_id) values ($1,$2,$3,$4)", [sellerId, planId, expires, txId]);
  await grantMonthlyCredits(db, sellerId);
  const plan = await db.one("select name from subscription_plans where id=$1", [planId]);
  await notify(db, sellerId, `You're on ${plan.name}`, `Active until ${expires.toDateString()}.`, "/seller/billing");
}

export async function grantMonthlyCredits(db: Db, sellerId: string) {
  const plan = await db.one("select * from effective_plan($1)", [sellerId]);
  if (plan.monthly_boost_credits > 0) {
    await db.run(
      `insert into boost_credit_ledger(seller_id, delta, reason, period) values ($1,$2,'Monthly plan credits', to_char(now(),'YYYY-MM'))
       on conflict do nothing`, [sellerId, plan.monthly_boost_credits]);
  }
}
