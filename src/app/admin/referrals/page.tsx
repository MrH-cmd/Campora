import Link from "next/link";
import { reviewReferral, saveReferralSettings } from "@/app/actions/admin";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead, Stat, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, shortDate } from "@/lib/format";

export const metadata = { title: "Referral Management" };
const TABS = [["all", "All"], ["review", "Needs review"], ["pending_purchase", "Pending"], ["reward_issued", "Successful"], ["rejected", "Rejected"]];

export default async function Referrals({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    s: await db.one("select * from referral_program_settings"),
    t: await db.one(
      `select (select count(*)::int from referrals) users, (select count(*)::int from referrals where status='reward_issued') ok,
        (select coalesce(sum(reward_kobo),0) from referral_rewards where status='issued') issued,
        (select coalesce(sum(-amount_kobo),0) from wallet_transactions where transaction_type in ('redemption','reversal')) redeemed`),
    rows: await db.rows(
      `select r.*, a.full_name referrer, b.full_name referred from referrals r join users a on a.id=r.referrer_id join users b on b.id=r.referred_user_id
       where $1='all' or r.status=$1 order by r.registered_at desc limit 200`, [tab]),
  }));
  const fixed = d.s.reward_type === "fixed";
  const val = (v: unknown) => (fixed ? Number(v) / 100 : Number(v));
  return (
    <>
      <PageHead title="Referral Management" action={<Badge tone={d.s.enabled && !d.s.suspended ? "green" : "neutral"}>{d.s.enabled && !d.s.suspended ? "Live" : "Off"}</Badge>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Users acquired" value={d.t.users} /><Stat label="Successful" value={d.t.ok} /><Stat label="Conversion" value={`${d.t.users ? Math.round((d.t.ok / d.t.users) * 100) : 0}%`} />
        <Stat label="Rewards issued" value={naira(d.t.issued)} /><Stat label="Rewards redeemed" value={naira(d.t.redeemed)} /><Stat label="Cost per success" value={naira(d.t.ok ? Math.round(Number(d.t.issued) / d.t.ok) : 0)} />
      </div>
      <Card className="mt-4">
        <h2 className="font-bold">Programme settings</h2>
        <Form action={saveReferralSettings} className="mt-2 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Reward type" name="reward_type" as="select" defaultValue={d.s.reward_type}><option value="fixed">Fixed credit (₦)</option><option value="percentage">Percent of order</option></Field>
            <Field label="Referrer reward" name="referrer_reward" defaultValue={val(d.s.referrer_reward)} />
            <Field label="New user reward" name="referred_reward" defaultValue={val(d.s.referred_reward)} />
            <Field label="Who gets rewarded" name="recipients" as="select" defaultValue={d.s.recipients}><option value="both">Both</option><option value="referrer">Referrer</option><option value="referred">New user</option></Field>
            <Field label="Referral period (days)" name="period_days" type="number" defaultValue={d.s.period_days} />
            <Field label="Max referrals per user" name="max_referrals" type="number" defaultValue={d.s.max_referrals} />
            <Field label="Minimum order (₦)" name="minimum_order" defaultValue={Number(d.s.minimum_order_kobo) / 100} />
            <Field label="Credit expires after (days)" name="reward_expiry_days" type="number" defaultValue={d.s.reward_expiry_days} />
            <Field label="Percent reward cap (₦)" name="percentage_cap" defaultValue={d.s.percentage_cap_kobo ? Number(d.s.percentage_cap_kobo) / 100 : ""} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={d.s.enabled} className="size-4 accent-palm" />Programme on</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="suspended" defaultChecked={d.s.suspended} className="size-4 accent-palm" />Suspended</label>
          </div>
          <Submit>Save settings</Submit>
        </Form>
      </Card>
      <div className="my-4 flex gap-1 overflow-x-auto">{TABS.map(([k, l]) => <Link key={k} href={`/admin/referrals?tab=${k}`} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-palm text-white" : "border border-line"}`}>{l}</Link>)}</div>
      {d.rows.length === 0 ? <Empty title="No referrals here" /> : (
        <Table head={["Referrer", "New user", "Joined", "Status", "Flags", ""]}>
          {d.rows.map((r) => (
            <tr key={r.id}><Td>{r.referrer}</Td><Td>{r.referred}</Td><Td>{shortDate(r.registered_at)}</Td><Td><Badge tone={statusTone(r.status)}>{r.status.replace(/_/g, " ")}</Badge></Td><Td className="text-xs text-mute">{r.flags.join(", ").replace(/_/g, " ")}</Td>
              <Td>{!["reward_issued", "rejected", "expired"].includes(r.status) && <div className="flex gap-1"><ActionButton action={reviewReferral} values={{ id: r.id, decision: "approve" }}>Approve</ActionButton><ActionButton action={reviewReferral} values={{ id: r.id, decision: "reject" }} variant="danger" confirm="Reject this referral?">Reject</ActionButton></div>}</Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
