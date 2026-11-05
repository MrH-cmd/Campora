import { redirect } from "next/navigation";
import { ReferralShare } from "@/components/referral-share";
import { Badge, Card, Empty, PageHead, Stat, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asSystem, asUser } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { naira, shortDate } from "@/lib/format";
import { assignReferralCode, programLive } from "@/lib/referrals";

export const metadata = { title: "My Rewards" };
const STATUS: Record<string, string> = { pending_purchase: "Pending purchase", awaiting_completion: "Awaiting order completion", successful: "Successful", reward_issued: "Reward issued", rejected: "Rejected", expired: "Expired", review: "Being checked" };

export default async function Rewards() {
  const u = await requireUser("/account/rewards");
  const code = await asSystem((db) => assignReferralCode(db, u.id));
  const d = await asUser(u.id, async (db) => ({
    s: await db.one("select * from referral_program_settings"),
    w: await db.one("select * from user_reward_wallets where user_id=$1", [u.id]),
    me: await db.one("select greatest(0, ceil(extract(epoch from (created_at + make_interval(days => (select period_days from referral_program_settings)) - now()))/86400))::int days_left from users where id=$1", [u.id]),
    refs: await db.rows("select r.id, r.status, r.registered_at, r.qualified_at, row_number() over (order by r.registered_at) n, (select max(issued_at) from referral_rewards x where x.referral_id=r.id) issued_at from referrals r where r.referrer_id=$1 order by r.registered_at desc", [u.id]),
    tx: await db.rows("select * from wallet_transactions where user_id=$1 order by created_at desc limit 30", [u.id]),
    lots: await db.rows("select remaining_kobo, expires_at from wallet_lots where user_id=$1 and remaining_kobo>0 and expires_at>now() order by expires_at limit 3", [u.id]),
  }));
  if (!d.s) redirect("/account");
  const live = programLive(d.s);
  const success = d.refs.filter((r) => r.status === "reward_issued").length;
  const pending = d.refs.filter((r) => ["pending_purchase", "awaiting_completion", "review", "successful"].includes(r.status)).length;
  const rejected = d.refs.filter((r) => r.status === "rejected").length;
  const pct = Math.min(100, Math.round((success / d.s.max_referrals) * 100));
  const reward = d.s.reward_type === "fixed" ? naira(d.s.referrer_reward) : `${d.s.referrer_reward}%`;
  return (
    <>
      <PageHead title="My Rewards" sub={live ? `Invite friends and earn ${reward} credit when they complete their first paid order.` : "The referral programme isn't running right now."} action={<Badge tone={live ? "green" : "neutral"}>{live ? "Active" : "Not active"}</Badge>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available credit" value={naira(d.w.available_kobo)} hint="Use it at checkout. It can't be withdrawn." />
        <Stat label="Total earned" value={naira(d.w.earned_kobo)} />
        <Stat label="Redeemed" value={naira(d.w.redeemed_kobo)} />
        <Stat label="Days left to refer" value={live ? d.me.days_left : "-"} />
      </div>
      {d.lots.length > 0 && <p className="mt-2 text-sm text-mute">{d.lots.map((l) => `${naira(l.remaining_kobo)} expires ${shortDate(l.expires_at)}`).join(". ")}.</p>}
      {live && d.me.days_left > 0 && (
        <Card className="mt-4">
          <h2 className="font-bold">Your referral link</h2>
          <ReferralShare code={code} link={appUrl(`/register?ref=${code}`)} />
          <p className="mt-4 text-sm font-medium">{success} of {d.s.max_referrals} successful referrals</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Referral progress"><div className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#e879f9] transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        </Card>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Referral history</h2>
          <p className="text-sm text-mute">{d.refs.length} invited, {pending} pending, {rejected} rejected</p>
          {d.refs.length === 0 ? <div className="mt-2"><Empty title="No referrals yet" /></div> : (
            <ul className="mt-2 divide-y divide-line text-sm">{d.refs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2"><span>Friend {r.n}, joined {shortDate(r.registered_at)}{r.issued_at ? `, rewarded ${shortDate(r.issued_at)}` : ""}</span><Badge tone={statusTone(r.status === "reward_issued" ? "completed" : r.status)}>{STATUS[r.status]}</Badge></li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Reward activity</h2>
          {d.tx.length === 0 ? <div className="mt-2"><Empty title="No activity yet" /></div> : (
            <ul className="mt-2 divide-y divide-line text-sm">{d.tx.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 py-2"><span>{t.description}<span className="block text-xs text-mute">{shortDate(t.created_at)}</span></span><span className="tabular-nums">{Number(t.amount_kobo) > 0 ? "+" : "-"}{naira(Math.abs(Number(t.amount_kobo)))}</span></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
