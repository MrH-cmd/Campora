import { SalesChart } from "@/components/charts";
import { Card, PageHead, Stat, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira } from "@/lib/format";

export const metadata = { title: "Marketplace Earnings and Commission" };
export default async function Earnings() {
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    t: await db.one(
      `select coalesce(sum(gross_kobo) filter (where status<>'reversed'),0) sales, coalesce(sum(commission_kobo) filter (where status='earned'),0) earned, coalesce(sum(commission_kobo) filter (where status='owed'),0) owed,
         coalesce(sum(net_kobo) filter (where status='earned'),0) sellers, (select coalesce(sum(amount_kobo),0) from seller_payouts where status in ('requested','processing')) pending, (select coalesce(sum(amount_kobo),0) from seller_payouts where status='paid') paid,
         (select coalesce(sum(amount_kobo),0) from refunds where status='processed') refunded from commissions`),
    series: await db.rows(`select to_char(d,'DD Mon') as day, coalesce(sum(c.commission_kobo),0)/100 as value from generate_series(current_date-29,current_date,'1 day') d left join commissions c on c.status<>'reversed' and c.created_at::date=d group by d order by d`),
    sellers: await db.rows("select s.name, sum(c.gross_kobo) sales, sum(c.commission_kobo) fee, sum(c.net_kobo) net from commissions c join storefronts s on s.id=c.storefront_id where c.status<>'reversed' group by s.name order by fee desc limit 50"),
    cats: await db.rows(`select coalesce(ca.name,'Uncategorised') name, sum(i.commission_kobo) fee from order_items i left join categories ca on ca.id=i.category_id join commissions c on c.order_id=i.order_id where c.status<>'reversed' group by 1 order by fee desc`),
    rows: await db.rows("select c.*, o.number, s.name from commissions c join orders o on o.id=c.order_id join storefronts s on s.id=c.storefront_id order by c.created_at desc limit 100"),
  }));
  return (
    <>
      <PageHead title="Marketplace Earnings and Commission" action={<div className="flex gap-3 text-sm font-semibold text-palm-deep"><a className="underline" href="/api/admin/export?report=commissions">Export commissions</a><a className="underline" href="/api/admin/export?report=ledger">Export ledger</a></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Marketplace sales" value={naira(d.t.sales)} /><Stat label="Commission earned" value={naira(d.t.earned)} /><Stat label="Commission owed on cash orders" value={naira(d.t.owed)} /><Stat label="Seller earnings" value={naira(d.t.sellers)} />
        <Stat label="Pending payouts" value={naira(d.t.pending)} /><Stat label="Completed payouts" value={naira(d.t.paid)} /><Stat label="Refunded" value={naira(d.t.refunded)} />
      </div>
      <Card className="mt-4"><h2 className="mb-2 font-bold">Commission by date</h2><SalesChart data={d.series.map((r) => ({ day: r.day, value: Number(r.value) }))} /></Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><h2 className="mb-2 font-bold">By seller</h2><Table head={["Seller", "Sales", "Commission", "Earnings"]}>{d.sellers.map((s) => <tr key={s.name}><Td>{s.name}</Td><Td>{naira(s.sales)}</Td><Td>{naira(s.fee)}</Td><Td>{naira(s.net)}</Td></tr>)}</Table></div>
        <div><h2 className="mb-2 font-bold">By category</h2><Table head={["Category", "Commission"]}>{d.cats.map((s) => <tr key={s.name}><Td>{s.name}</Td><Td>{naira(s.fee)}</Td></tr>)}</Table></div>
      </div>
      <h2 className="mb-2 mt-4 font-bold">Every commission</h2>
      <Table head={["Order", "Seller", "Sale", "Eligible", "Rate", "Commission", "Seller gets", "Status"]}>{d.rows.map((c) => <tr key={c.id}><Td>{c.number}</Td><Td>{c.name}</Td><Td>{naira(c.gross_kobo)}</Td><Td>{naira(c.eligible_kobo)}</Td><Td>{c.rate_bps / 100}%</Td><Td>{naira(c.commission_kobo)}</Td><Td>{naira(c.net_kobo)}</Td><Td>{c.status}</Td></tr>)}</Table>
    </>
  );
}
