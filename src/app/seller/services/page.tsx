import Link from "next/link";
import { sellerContext } from "@/app/actions/seller";
import { Badge, Card, Empty, PageHead, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { ORDER_STATUS_LABEL, shortDate } from "@/lib/format";

export const metadata = { title: "Service tracking" };
export default async function Services() {
  const { user, store } = await sellerContext();
  const rows = store ? await asUser(user.id, (db) => db.rows(
    `select o.id, o.number, o.status, o.service_stage, o.service_expected_at, u.full_name, (select string_agg(title, ', ') from order_items i where i.order_id=o.id and i.kind='service') items
     from orders o join users u on u.id=o.buyer_id where o.storefront_id=$1 and o.status not in ('completed','cancelled') and o.payment_status<>'awaiting_payment'
       and exists (select 1 from order_items i where i.order_id=o.id and i.kind='service') order by o.created_at`, [store.id])) : [];
  return (
    <>
      <PageHead title="Service tracking" sub="Customers see every update you post on their order page." />
      {rows.length === 0 ? <Empty title="No active service orders" /> : <div className="space-y-2">{rows.map((o) => (
        <Link key={o.id} href={`/seller/orders/${o.id}`} className="block"><Card className="flex items-center justify-between gap-3 hover:border-palm">
          <div><p className="font-semibold">{o.items}</p><p className="text-sm text-mute">{o.full_name}, {o.number}{o.service_expected_at ? `, due ${shortDate(o.service_expected_at)}` : ""}</p><p className="text-sm text-palm-deep">{o.service_stage}</p></div>
          <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
        </Card></Link>
      ))}</div>}
    </>
  );
}
