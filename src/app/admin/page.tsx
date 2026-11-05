import { CountBars, SalesChart } from "@/components/charts";
import { Card, PageHead, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, timeAgo } from "@/lib/format";

export const metadata = { title: "Admin" };
export default async function AdminHome() {
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    s: await db.one(
      `select (select count(*)::int from users) users,
        (select count(*)::int from users where role='customer') buyers,
        (select count(*)::int from users where role='seller') sellers,
        (select count(*)::int from transactions where status='success') txns,
        (select count(*)::int from storefronts where status='active') stores,
        (select count(*)::int from listings where status='active') listings,
        (select count(*)::int from reports where status='open') reports,
        (select count(*)::int from listings where status='pending_review') review,
        (select coalesce(sum(commission_kobo),0) from commissions where status='earned') commission,
        (select coalesce(sum(amount_kobo),0) from transactions where status='success' and purpose in ('subscription','boost')) fees`),
    plans: await db.rows(
      `select p.name, count(s.id)::int as value from subscription_plans p left join subscriptions s on s.plan_id=p.id and s.status='active' group by p.id, p.sort order by p.sort`),
    series: await db.rows(
      `select to_char(d,'DD Mon') as day, coalesce(sum(t.amount_kobo),0)/100 as value from generate_series(current_date-29,current_date,'1 day') d
       left join transactions t on t.status='success' and t.created_at::date=d group by d order by d`),
    logs: await db.rows("select l.*, u.full_name from admin_activity_logs l join users u on u.id=l.admin_id order by l.created_at desc limit 8"),
  }));
  const revenue = Number(d.s.commission) + Number(d.s.fees);
  return (
    <>
      <PageHead title="Overview" sub="Verified payments only. Sample data has no transactions." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Registered users" value={d.s.users} /><Stat label="Buyers" value={d.s.buyers} /><Stat label="Sellers" value={d.s.sellers} />
        <Stat label="Transactions" value={d.s.txns} /><Stat label="Platform revenue" value={naira(revenue)} hint="Commission, plans and boosts" />
        <Stat label="Active storefronts" value={d.s.stores} /><Stat label="Active listings" value={d.s.listings} /><Stat label="Listings in review" value={d.s.review} /><Stat label="Open reports" value={d.s.reports} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card><h2 className="mb-2 font-bold">Verified payments, 30 days</h2><SalesChart data={d.series.map((r) => ({ day: r.day, value: Number(r.value) }))} /></Card>
        <Card><h2 className="mb-2 font-bold">Subscriptions by plan</h2><CountBars data={d.plans} label="Sellers" /></Card>
      </div>
      <Card className="mt-4"><h2 className="font-bold">Recent admin activity</h2>
        {d.logs.length === 0 ? <p className="text-sm text-mute">Nothing yet.</p> : <ul className="mt-1 text-sm">{d.logs.map((l) => <li key={l.id} className="flex justify-between gap-2 py-1"><span>{l.full_name}: {l.action}</span><span className="text-mute">{timeAgo(l.created_at)}</span></li>)}</ul>}
      </Card>
    </>
  );
}
