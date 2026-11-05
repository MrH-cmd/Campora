import Link from "next/link";
import { sellerContext } from "@/app/actions/seller";
import { CountBars, SalesChart } from "@/components/charts";
import { Card, Empty, PageHead, Stat, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira } from "@/lib/format";

export const metadata = { title: "Analytics" };
export default async function Analytics() {
  const { user, store, plan } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" />;
  const days = [7, 30, 90][plan.analytics_level];
  const d = await asUser(user.id, async (db) => ({
    series: await db.rows(
      `select to_char(d,'DD Mon') as day, coalesce(sum(o.total_kobo),0)/100 as value from generate_series(current_date-($2::int-1), current_date, '1 day') d
       left join orders o on o.storefront_id=$1 and o.status='completed' and o.updated_at::date=d group by d order by d`, [store.id, days]),
    totals: await db.one(
      `select coalesce(sum(s.views),0)::int views, coalesce(sum(s.enquiries),0)::int enquiries from listing_daily_stats s join listings l on l.id=s.listing_id
       where l.storefront_id=$1 and s.day > current_date-$2::int`, [store.id, days]),
    orders: await db.one(`select count(*)::int n, coalesce(avg(total_kobo),0) avg from orders where storefront_id=$1 and status='completed' and created_at > now()-make_interval(days=>$2)`, [store.id, days]),
    top: plan.analytics_level >= 1 ? await db.rows(
      `select l.title, coalesce(sum(s.views),0)::int views, coalesce(sum(s.enquiries),0)::int enquiries, l.sold_count from listings l
       left join listing_daily_stats s on s.listing_id=l.id and s.day > current_date-$2::int where l.storefront_id=$1 group by l.id order by views desc limit 8`, [store.id, days]) : [],
    statuses: plan.analytics_level >= 2 ? await db.rows("select status::text as name, count(*)::int as value from orders where storefront_id=$1 group by status", [store.id]) : [],
  }));
  const conv = d.totals.views ? ((d.orders.n / d.totals.views) * 100).toFixed(1) : "0";
  return (
    <>
      <PageHead title="Analytics" sub={`Last ${days} days on ${plan.name}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Listing views" value={d.totals.views} /><Stat label="Enquiries" value={d.totals.enquiries} /><Stat label="Completed orders" value={d.orders.n} />
        {plan.analytics_level >= 1 ? <Stat label="Average order" value={naira(Math.round(d.orders.avg))} /> : <Stat label="Average order" value="Locked" hint="On No Dulling" />}
      </div>
      <Card className="mt-4"><h2 className="mb-2 font-bold">Sales</h2><SalesChart data={d.series.map((r) => ({ day: r.day, value: Number(r.value) }))} /></Card>
      {plan.analytics_level >= 1 ? (
        <div className="mt-4"><h2 className="mb-2 font-bold">Top listings</h2>
          <Table head={["Listing", "Views", "Enquiries", "Sold"]}>{d.top.map((t, i) => <tr key={i}><Td>{t.title}</Td><Td>{t.views}</Td><Td>{t.enquiries}</Td><Td>{t.sold_count}</Td></tr>)}</Table>
        </div>
      ) : <p className="mt-4 text-sm text-mute"><Link className="underline" href="/seller/billing">Move to No Dulling</Link> for 30 days of data and per-listing numbers.</p>}
      {plan.analytics_level >= 2 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]"><Stat label="Views to orders" value={`${conv}%`} /><Card><h2 className="mb-2 font-bold">Orders by status</h2><CountBars data={d.statuses} label="Orders" /></Card></div>
      ) : plan.analytics_level === 1 && <p className="mt-4 text-sm text-mute"><Link className="underline" href="/seller/billing">Odogwu</Link> adds 90 days of data and conversion.</p>}
    </>
  );
}
