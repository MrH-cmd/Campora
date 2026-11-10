import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth-core";
import type { Db } from "./db";

/** Reasons the account can't be deleted yet. Money and open orders must settle first. */
export async function deletionBlockers(db: Db, userId: string) {
  const out: string[] = [];
  const open = await db.one(
    `select count(*)::int n from orders o left join storefronts s on s.id=o.storefront_id
     where (o.buyer_id=$1 or s.owner_id=$1) and o.status not in ('completed','cancelled') and o.payment_status<>'awaiting_payment'`, [userId]);
  if (open.n) out.push(`You have ${open.n} open order${open.n > 1 ? "s" : ""}. Complete or cancel them first.`);
  // Added up across every storefront the seller owns.
  const b = await db.one(
    `select sum(b.earned_kobo) earned_kobo, sum(b.paid_out_kobo) paid_out_kobo, sum(b.requested_kobo) requested_kobo, sum(b.owed_kobo) owed_kobo
     from seller_balances b join storefronts s on s.id=b.storefront_id where s.owner_id=$1 having count(*) > 0`, [userId]);
  if (b) {
    const available = Number(b.earned_kobo) - Number(b.paid_out_kobo) - Number(b.requested_kobo) - Number(b.owed_kobo);
    if (available > 0) out.push("You have seller earnings to withdraw. Request a payout first.");
    if (Number(b.requested_kobo) > 0) out.push("You have a payout in progress.");
    if (available < 0) out.push("You owe commission on cash orders. Settle it with the Vybe Market team first.");
  }
  const d = await db.one("select count(*)::int n from disputes d join orders o on o.id=d.order_id where d.status='open' and (o.buyer_id=$1 or d.opened_by=$1)", [userId]);
  if (d.n) out.push("You have an open dispute.");
  return out;
}

/** Removes personal data. Orders, commissions and the ledger stay, tied to an anonymous account. */
export async function anonymize(db: Db, userId: string) {
  const docs = await db.rows("select document_path from student_verifications where user_id=$1 and document_path is not null", [userId]);
  for (const d of docs) await db.run("delete from file_blobs where path=$1", [d.document_path]);
  await db.run("delete from file_blobs where owner_id=$1 and path like 'public/avatars/%'", [userId]);
  await db.run("update student_verifications set document_path=null, matric_number=null, student_email=null, full_name=null, department=null, academic_level=null, internal_note=null where user_id=$1", [userId]);
  for (const t of ["sessions", "auth_tokens", "cart_items", "favourites", "notifications"]) await db.run(`delete from ${t} where user_id=$1`, [userId]);
  await db.run("update messages set body='[deleted]' where sender_id=$1", [userId]);
  await db.run("update storefronts set status='hidden', contact_phone=null, contact_whatsapp=null, contact_email=null where owner_id=$1", [userId]);
  await db.run("update listings l set status='inactive' from storefronts s where s.id=l.storefront_id and s.owner_id=$1 and l.status not in ('removed')", [userId]);
  await db.run("update seller_profiles set bank_name=null, account_number=null, account_name=null, bank_code=null, paystack_recipient_code=null where user_id=$1", [userId]);
  await db.run("update wallet_lots set remaining_kobo=0 where user_id=$1", [userId]);
  await db.run("update reviews set is_hidden=is_hidden where author_id=$1", [userId]);
  const hash = await hashPassword(randomBytes(32).toString("hex"));
  await db.run(
    `update users set email='deleted-'||id||'@deleted.invalid', full_name='Deleted user', phone=null, avatar_path=null, password_hash=$2, status='suspended',
       referral_code=null, deleted_at=now(), deletion_requested_at=null where id=$1`, [userId, hash]);
}

export async function runDeletions(db: Db) {
  const due = await db.rows("select id, user_id from account_deletion_requests where status='scheduled' and scheduled_for<=now()");
  let done = 0;
  for (const r of due) {
    if ((await deletionBlockers(db, r.user_id)).length) continue; // Tries again on the next daily run.
    await anonymize(db, r.user_id);
    await db.run("update account_deletion_requests set status='completed', completed_at=now() where id=$1", [r.id]);
    done++;
  }
  return done;
}
