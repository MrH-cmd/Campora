import { redirect } from "next/navigation";
import Link from "next/link";
import { sellerContext } from "@/app/actions/seller";
import { SalesChart } from "@/components/charts";
import { Badge, Card, Empty, LinkButton, PageHead, Stat, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, ORDER_STATUS_LABEL, timeAgo } from "@/lib/format";

export const metadata = { title: "Seller dashboard" };

export default async function Overview() {
  const { user, store, plan } = await sellerContext();
  if (!store) redirect("/seller/storefront");
  const d = await asUser(user.id, async (db) => ({
    s: await db.one(
      `select
        (select coalesce(sum(total_kobo),0) from orders where storefront_id=$1 and status='completed') sales,
        (select count(*)::int from orders where storefront_id=$1 and payment_status<>'awaiting_payment') orders,
        (select count(*)::int from orders where storefront_id=$1 and status='pending' and payment_status<>'awaiting_payment') pending,
        (select count(*)::int from listings where storefront_id=$1 and status in ('active','pending_review')) active,
        (select coalesce(sum(net_kobo),0) from commissions where storefront_id=$1 and status='earned') earned,
        (select count(*)::int from conversations where storefront_id=$1) enquiries`, [store.id]),
    series: await db.rows(
      `select to_char(d,'DD Mon') as day, coalesce(sum(o.total_kobo),0)/100 as value
       from generate_series(current_date-13, current_date, '1 day') d
       left join orders o on o.storefront_id=$1 and o.status='completed' and o.updated_at::date=d group by d order by d`, [store.id]),
    recent: await db.rows(
      `select o.id, o.number, o.status, o.total_kobo, o.created_at, u.full_name from orders o join users u on u.id=o.buyer_id
       where o.storefront_id=$1 and o.payment_status<>'awaiting_payment' order by o.updated_at desc limit 6`, [store.id]),
  }));
  return (
    <>
      <PageHead title={store.name} sub={`You're on ${plan.name}: ${d.s.active} of ${plan.listing_limit} listings used`} action={<LinkButton href="/seller/listings/new">Add a listing</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total sales" value={naira(d.s.sales)} /><Stat label="Total orders" value={d.s.orders} /><Stat label="Pending orders" value={d.s.pending} />
        <Stat label="Active listings" value={d.s.active} /><Stat label="Total earnings" value={naira(d.s.earned)} hint="Paid online, after commission" /><Stat label="Customer enquiries" value={d.s.enquiries} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card><h2 className="mb-2 font-bold">Sales, last 14 days</h2><SalesChart data={d.series.map((r) => ({ day: r.day, value: Number(r.value) }))} /></Card>
        <Card><h2 className="mb-2 font-bold">Recent activity</h2>
          {d.recent.length === 0 ? <Empty title="No orders yet" body="Share your storefront link to get your first one." /> : (
            <ul className="divide-y divide-line">{d.recent.map((o) => (
              <li key={o.id}><Link href={`/seller/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{o.full_name}</span><span className="text-xs text-mute">{naira(o.total_kobo)}, {timeAgo(o.created_at)}</span></span>
                <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></Link></li>
            ))}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
