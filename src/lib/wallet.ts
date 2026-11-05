import { ActionError } from "./auth";
import type { Db } from "./db";

export const lockWallet = (db: Db, userId: string) => db.run("select pg_advisory_xact_lock(hashtextextended($1, 7))", [userId]);

export async function walletBalance(db: Db, userId: string) {
  return Number((await db.one("select coalesce(sum(remaining_kobo),0) n from wallet_lots where user_id=$1 and expires_at>now()", [userId])).n);
}

/** The reference is unique, so repeating a credit does nothing. */
export async function creditWallet(db: Db, p: { userId: string; amountKobo: number; reference: string; description: string; expiresAt: Date }) {
  const seen = await db.one("select 1 from wallet_transactions where reference=$1", [p.reference]);
  if (seen) return false;
  const lot = await db.one("insert into wallet_lots(user_id,amount_kobo,remaining_kobo,expires_at) values ($1,$2,$2,$3) returning id", [p.userId, p.amountKobo, p.expiresAt]);
  await db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description,allocations) values ($1,'reward',$2,$3,$4,$5)",
    [p.userId, p.amountKobo, p.reference, p.description, JSON.stringify([{ lot: lot.id, kobo: p.amountKobo }])]);
  return true;
}

/** Spends the credit closest to expiry first. Call lockWallet first. */
export async function spendWallet(db: Db, p: { userId: string; amountKobo: number; reference: string; description: string; orderId: string }) {
  const lots = await db.rows("select id, remaining_kobo from wallet_lots where user_id=$1 and remaining_kobo>0 and expires_at>now() order by expires_at, created_at for update", [p.userId]);
  let left = p.amountKobo; const allocations: { lot: string; kobo: number }[] = [];
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(left, Number(l.remaining_kobo));
    await db.run("update wallet_lots set remaining_kobo=remaining_kobo-$2 where id=$1", [l.id, take]);
    allocations.push({ lot: l.id, kobo: take }); left -= take;
  }
  if (left > 0) throw new ActionError("Your reward balance has changed. Review your checkout.");
  await db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description,order_id,allocations) values ($1,'redemption',$2,$3,$4,$5,$6)",
    [p.userId, -p.amountKobo, p.reference, p.description, p.orderId, JSON.stringify(allocations)]);
}

/** Puts spent credit back on the same lots. Expired lots keep their expiry, so old credit doesn't come back to life. */
export async function reverseRedemption(db: Db, orderId: string) {
  const t = await db.one("select * from wallet_transactions where order_id=$1 and transaction_type='redemption'", [orderId]);
  if (!t) return;
  const ref = `reversal:${t.reference}`;
  if (await db.one("select 1 from wallet_transactions where reference=$1", [ref])) return;
  for (const a of t.allocations) await db.run("update wallet_lots set remaining_kobo=remaining_kobo+$2 where id=$1", [a.lot, a.kobo]);
  await db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description,order_id,allocations) values ($1,'reversal',$2,$3,'Credit restored from a cancelled or refunded order',$4,$5)",
    [t.user_id, -Number(t.amount_kobo), ref, orderId, JSON.stringify(t.allocations)]);
}

export async function expireLots(db: Db) {
  const lots = await db.rows("select * from wallet_lots where remaining_kobo>0 and expires_at<=now() for update");
  for (const l of lots) {
    await db.run("update wallet_lots set remaining_kobo=0 where id=$1", [l.id]);
    await db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description) values ($1,'expiry',$2,$3,'Reward credit expired') on conflict do nothing",
      [l.user_id, -Number(l.remaining_kobo), `expiry:${l.id}`]);
  }
  return lots.length;
}
