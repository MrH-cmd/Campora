import Link from "next/link";
import { notFound } from "next/navigation";
import { sellerContext, updateOrder } from "@/app/actions/seller";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { dateTime, naira, ORDER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/format";

export const metadata = { title: "Order" };
export default async function SellerOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, store } = await sellerContext();
  const d = await asUser(user.id, async (db) => {
    const o = await db.one(
      `select o.*, u.full_name, u.email, u.phone, c.id convo from orders o join users u on u.id=o.buyer_id
       left join conversations c on c.buyer_id=o.buyer_id and c.storefront_id=o.storefront_id where o.id=$1 and o.storefront_id=$2`, [id, store?.id]).catch(() => null);
    if (!o) return null;
    return { o, items: await db.rows("select * from order_items where order_id=$1", [id]), events: await db.rows("select * from order_events where order_id=$1 order by created_at", [id]) };
  });
  if (!d) notFound();
  const { o } = d;
  const act = (status: string, label: string, variant: any = "primary", confirm?: string) => <ActionButton action={updateOrder} values={{ order_id: o.id, status }} size="md" variant={variant} confirm={confirm}>{label}</ActionButton>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{o.number}</h1><Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge><Badge tone={statusTone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Badge></div>
        <Card>
          <h2 className="font-bold">Next step</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {o.status === "pending" && <>{act("accepted", "Accept order")}{act("cancelled", "Reject order", "danger", "Reject this order? Paid orders go to refund review.")}</>}
            {o.status === "accepted" && <>{act("processing", "Start processing")}{act("ready_for_pickup", "Mark ready for pickup", "dark")}{act("cancelled", "Cancel", "danger", "Cancel this order?")}</>}
            {o.status === "processing" && <>{act("ready_for_pickup", "Mark ready for pickup")}{act("cancelled", "Cancel", "danger", "Cancel this order?")}</>}
            {o.status === "ready_for_pickup" && (
              <Form action={updateOrder} className="flex items-end gap-2">
                <input type="hidden" name="order_id" value={o.id} /><input type="hidden" name="status" value="completed" />
                <Field label="Buyer's pickup code" name="code" inputMode="numeric" /><Submit>Complete order</Submit>
              </Form>
            )}
            {["completed", "cancelled"].includes(o.status) && <p className="text-sm text-mute">This order is closed.</p>}
          </div>
        </Card>
        <Card><h2 className="font-bold">Items</h2>
          <ul className="mt-1 divide-y divide-line">{d.items.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.quantity} × {i.title}</span><span className="tabular-nums">{naira(i.unit_price_kobo * i.quantity)}</span></li>)}</ul>
          <p className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span>{naira(o.total_kobo)}</span></p>
        </Card>
        <Card><h2 className="font-bold">Timeline</h2><ul className="mt-1 text-sm">{d.events.map((e) => <li key={e.id} className="flex justify-between gap-2 py-1"><span>{ORDER_STATUS_LABEL[e.status]}{e.note ? `: ${e.note}` : ""}</span><span className="text-mute">{dateTime(e.created_at)}</span></li>)}</ul></Card>
      </div>
      <Card className="h-fit">
        <h2 className="font-bold">Customer</h2><p>{o.full_name}</p><p className="text-sm text-mute">{o.email}</p>{o.phone && <p className="text-sm text-mute">{o.phone}</p>}
        <h2 className="mt-3 font-bold">Campus pickup</h2><p>{o.pickup_point}</p>{o.buyer_note && <p className="mt-1 text-sm text-mute">Note: {o.buyer_note}</p>}
        {o.convo && <Link href={`/messages/${o.convo}`} className="mt-3 inline-block font-semibold text-palm-deep underline">Open conversation</Link>}
      </Card>
    </div>
  );
}
