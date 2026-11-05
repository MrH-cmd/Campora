import Link from "next/link";
import { sellerContext } from "@/app/actions/seller";
import { Badge, Empty, PageHead, statusTone, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, ORDER_STATUS_LABEL, PAYMENT_LABEL, timeAgo } from "@/lib/format";

export const metadata = { title: "Orders" };
const TABS = [["", "All"], ["pending", "Pending"], ["accepted", "Accepted"], ["processing", "Processing"], ["ready_for_pickup", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"]];

export default async function SellerOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { user, store } = await sellerContext();
  const rows = store ? await asUser(user.id, (db) => db.rows(
    `select o.*, u.full_name from orders o join users u on u.id=o.buyer_id
     where o.storefront_id=$1 and o.payment_status<>'awaiting_payment' and ($2='' or o.status::text=$2) order by o.created_at desc limit 100`, [store.id, status ?? ""])) : [];
  return (
    <>
      <PageHead title="Orders" />
      <div className="mb-4 flex gap-1 overflow-x-auto">{TABS.map(([v, l]) => <Link key={v} href={v ? `/seller/orders?status=${v}` : "/seller/orders"} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${(status ?? "") === v ? "bg-panel text-white" : "border border-line bg-card"}`}>{l}</Link>)}</div>
      {rows.length === 0 ? <Empty title="No orders here" /> : (
        <Table head={["Order", "Customer", "Total", "Payment", "Status", "Placed"]}>
          {rows.map((o) => (
            <tr key={o.id}><Td><Link className="font-semibold text-palm-deep" href={`/seller/orders/${o.id}`}>{o.number}</Link></Td><Td>{o.full_name}</Td><Td className="tabular-nums">{naira(o.total_kobo)}</Td>
              <Td><Badge tone={statusTone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Badge></Td><Td><Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></Td><Td className="text-mute">{timeAgo(o.created_at)}</Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
