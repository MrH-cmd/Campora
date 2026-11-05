import { asSystem, type Db } from "./db";
import { sendEmail } from "./email";

export const notify = (db: Db, userId: string, title: string, body: string | null, href: string) =>
  db.run("insert into notifications(user_id, title, body, href) values ($1,$2,$3,$4)", [userId, title, body, href]);

export const logAdmin = (db: Db, adminId: string, action: string, targetType: string, targetId: string, meta: object = {}) =>
  db.run("insert into admin_activity_logs(admin_id, action, target_type, target_id, meta) values ($1,$2,$3,$4,$5)",
    [adminId, action, targetType, targetId, meta]);

/** Append-only. The reference makes repeating an entry harmless. */
export const ledger = (db: Db, reference: string, type: string, amountKobo: number, p: { orderId?: string; storefrontId?: string; transactionId?: string; memo?: string } = {}) =>
  db.run("insert into financial_ledger(reference,entry_type,amount_kobo,order_id,storefront_id,transaction_id,memo) values ($1,$2,$3,$4,$5,$6,$7) on conflict (reference) do nothing",
    [reference, type, amountKobo, p.orderId ?? null, p.storefrontId ?? null, p.transactionId ?? null, p.memo ?? null]);

export async function emailUser(userId: string, subject: string, body: string) {
  const u = await asSystem((db) => db.one("select email from users where id=$1 and deleted_at is null", [userId]));
  if (u) await sendEmail(u.email, subject, body);
}
