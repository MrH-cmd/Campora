import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";
import { notify } from "./notify";
import { creditWallet } from "./wallet";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newReferralCode = () => Array.from(randomBytes(7), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** Retries on the unique index, so codes can't collide. */
export async function assignReferralCode(db: Db, userId: string) {
  for (let i = 0; i < 6; i++) {
    const n = await db.run("update users set referral_code=$2 where id=$1 and referral_code is null and not exists (select 1 from users where referral_code=$2)", [userId, newReferralCode()]);
    if (n) break;
    if ((await db.one("select referral_code from users where id=$1", [userId]))?.referral_code) break;
  }
  return (await db.one("select referral_code from users where id=$1", [userId])).referral_code as string;
}

export const programSettings = (db: Db) => db.one("select * from referral_program_settings");
export const programLive = (s: any) => s.enabled && !s.suspended;
export const hashIp = (ip: string) => createHash("sha256").update(`${process.env.CRON_SECRET ?? "vybe"}:${ip}`).digest("hex").slice(0, 32);

/** Called once during registration, in the same transaction that creates the account. */
export async function attachReferral(db: Db, newUser: { id: string; email: string }, code: string | null | undefined, ipHash: string | null) {
  if (!code) return;
  const s = await programSettings(db);
  if (!programLive(s)) return;
  const referrer = await db.one(
    `select id, email, created_at > now() - make_interval(days => $2) as in_window from users where referral_code=$1 and status='active' and deleted_at is null`, [code.trim().toUpperCase(), s.period_days]);
  if (!referrer || !referrer.in_window || referrer.id === newUser.id) return;
  const flags: string[] = [];
  const bare = (e: string) => { const [a, d] = e.toLowerCase().split("@"); return `${a.split("+")[0].replace(/\./g, "")}@${d}`; };
  if (bare(referrer.email) === bare(newUser.email)) flags.push("email_alias_of_referrer");
  if (ipHash) {
    const same = await db.one("select count(*)::int n from referrals where referrer_id=$1 and signup_ip_hash=$2 and registered_at > now() - interval '1 day'", [referrer.id, ipHash]);
    if (same.n >= 2) flags.push("many_signups_same_network");
  }
  await db.run(
    "insert into referrals(referrer_id,referred_user_id,referral_code,flags,signup_ip_hash,status) values ($1,$2,$3,$4,$5,$6) on conflict (referred_user_id) do nothing",
    [referrer.id, newUser.id, code.trim().toUpperCase(), flags, ipHash, flags.length ? "review" : "pending_purchase"]);
}

/** Runs when an order completes. Unique constraints make it exactly-once even if called repeatedly. */
export async function processReferral(db: Db, order: any) {
  const r = await db.one("select * from referrals where referred_user_id=$1 for update", [order.buyer_id]);
  if (!r || !["pending_purchase", "awaiting_completion", "review"].includes(r.status) || r.qualifying_order_id) return;
  const s = await programSettings(db);
  if (order.payment_status !== "paid") return; // Only payments verified with the provider count.
  if (Number(order.total_kobo) < Number(s.minimum_order_kobo)) return;
  await db.run("update referrals set qualifying_order_id=$2, qualified_at=now() where id=$1", [r.id, order.id]);
  if (r.status === "review") return; // An admin decides.
  await issueRewards(db, r.id);
}

export async function issueRewards(db: Db, referralId: string) {
  const r = await db.one("select * from referrals where id=$1 for update", [referralId]);
  const order = await db.one("select * from orders where id=$1", [r.qualifying_order_id]);
  const s = await programSettings(db);
  if (!programLive(s)) { await db.run("update referrals set status='successful' where id=$1", [r.id]); return; }
  const done = await db.one("select count(*)::int n from referrals where referrer_id=$1 and status='reward_issued'", [r.referrer_id]);
  if (done.n >= s.max_referrals) {
    await db.run("update referrals set status='rejected', rejection_reason='Reached the maximum rewarded referrals' where id=$1", [r.id]);
    return;
  }
  const expires = new Date(Date.now() + s.reward_expiry_days * 86400_000);
  const amount = (base: number) => {
    if (s.reward_type === "fixed") return base;
    const v = Math.floor((Number(order.total_kobo) * base) / 100);
    return s.percentage_cap_kobo ? Math.min(v, Number(s.percentage_cap_kobo)) : v;
  };
  const pay = async (userId: string, value: number, label: string) => {
    if (value <= 0) return;
    const row = await db.one(
      "insert into referral_rewards(referral_id,user_id,reward_kobo,expires_at) values ($1,$2,$3,$4) on conflict (referral_id,user_id) do nothing returning id", [r.id, userId, value, expires]);
    if (!row) return;
    await creditWallet(db, { userId, amountKobo: value, reference: `referral:${row.id}`, description: label, expiresAt: expires });
    await notify(db, userId, "You earned reward credit", `₦${(value / 100).toLocaleString("en-NG")} is ready to use at checkout.`, "/account/rewards");
  };
  if (s.recipients !== "referred") await pay(r.referrer_id, amount(Number(s.referrer_reward)), "Referral reward");
  if (s.recipients !== "referrer") await pay(r.referred_user_id, amount(Number(s.referred_reward)), "Welcome reward for joining through a friend");
  await db.run("update referrals set status='reward_issued' where id=$1", [r.id]);
}

/** A refund undoes the referral. Only credit that is still unspent can be taken back. */
export async function reverseReferral(db: Db, orderId: string) {
  const r = await db.one("select * from referrals where qualifying_order_id=$1 for update", [orderId]);
  if (!r) return;
  for (const w of await db.rows("select * from referral_rewards where referral_id=$1 and status='issued'", [r.id])) {
    const t = await db.one("select allocations from wallet_transactions where reference=$1", [`referral:${w.id}`]);
    let taken = 0;
    for (const a of t?.allocations ?? []) {
      const l = await db.one("select remaining_kobo from wallet_lots where id=$1 for update", [a.lot]);
      taken += Number(l?.remaining_kobo ?? 0);
      await db.run("update wallet_lots set remaining_kobo=0 where id=$1", [a.lot]);
    }
    await db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description,order_id) values ($1,'clawback',$2,$3,'Referral reward reversed after a refund',$4) on conflict do nothing",
      [w.user_id, -taken, `clawback:${w.id}`, orderId]);
    await db.run("update referral_rewards set status='reversed' where id=$1", [w.id]);
  }
  await db.run("update referrals set status='rejected', rejection_reason='Qualifying order was refunded', qualifying_order_id=null where id=$1", [r.id]);
}
