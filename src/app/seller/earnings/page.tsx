import { requestPayout, sellerContext } from "@/app/actions/seller";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead, Stat, statusTone, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, shortDate } from "@/lib/format";

export const metadata = { title: "Earnings" };
export default async function Earnings() {
  const { user, store } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" />;
  const d = await asUser(user.id, async (db) => ({
    b: await db.one("select * from seller_balances where storefront_id=$1", [store.id]),
    comm: await db.rows("select c.*, o.number from commissions c join orders o on o.id=c.order_id where c.storefront_id=$1 order by c.created_at desc limit 30", [store.id]),
    payouts: await db.rows("select * from seller_payouts where storefront_id=$1 order by created_at desc limit 20", [store.id]),
  }));
  const available = Number(d.b.earned_kobo) - Number(d.b.paid_out_kobo) - Number(d.b.requested_kobo);
  return (
    <>
      <PageHead title="Earnings" sub="Earnings come from completed orders paid online. Money you collect at pickup is already yours." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available" value={naira(available)} /><Stat label="Earned" value={naira(d.b.earned_kobo)} /><Stat label="Payouts requested" value={naira(d.b.requested_kobo)} /><Stat label="Paid out" value={naira(d.b.paid_out_kobo)} />
      </div>
      <Card className="mt-4 max-w-md">
        <Form action={requestPayout} resetOnSuccess className="flex items-end gap-2"><div className="flex-1"><Field label="Amount (₦)" name="amount" inputMode="decimal" /></div><Submit>Request payout</Submit></Form>
      </Card>
      <h2 className="mb-2 mt-8 text-xl font-bold">Payouts</h2>
      {d.payouts.length === 0 ? <Empty title="No payouts yet" /> : <Table head={["Date", "Amount", "Reference", "Status"]}>{d.payouts.map((p) => <tr key={p.id}><Td>{shortDate(p.created_at)}</Td><Td>{naira(p.amount_kobo)}</Td><Td>{p.bank_reference}</Td><Td><Badge tone={statusTone(p.status)}>{p.status}</Badge></Td></tr>)}</Table>}
      <h2 className="mb-2 mt-8 text-xl font-bold">Commission by order</h2>
      {d.comm.length === 0 ? <Empty title="Nothing yet" /> : <Table head={["Order", "Sale", "Commission", "You earn", "Status"]}>{d.comm.map((c) => <tr key={c.id}><Td>{c.number}</Td><Td>{naira(c.gross_kobo)}</Td><Td>{naira(c.commission_kobo)} ({c.rate_bps / 100}%)</Td><Td>{naira(c.net_kobo)}</Td><Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td></tr>)}</Table>}
    </>
  );
}
