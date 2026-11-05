import Link from "next/link";
import { notFound } from "next/navigation";
import { sellerContext, updateOrder, updatePickup, updateService } from "@/app/actions/seller";
import { LocationShare } from "@/components/tracker";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { dateTime, naira, ORDER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/format";
import { commissionFor } from "@/lib/pricing";
import { loadTracker } from "@/lib/tracker";

const STAGES = ["Seller accepted the request", "Service scheduled", "Work started", "Work in progress", "Service ready", "Customer notified"];

export const metadata = { title: "Order" };
export default async function SellerOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, store } = await sellerContext();
  const d = await asUser(user.id, async (db) => {
    const o = await db.one(
      `select o.*, u.full_name, u.email, u.phone, c.id convo from orders o join users u on u.id=o.buyer_id
       left join conversations c on c.buyer_id=o.buyer_id and c.storefront_id=o.storefront_id where o.id=$1 and o.storefront_id=$2`, [id, store?.id]).catch(() => null);
    if (!o) return null;
    return { o, items: await db.rows("select * from order_items where order_id=$1", [id]), events: await db.rows("select * from order_events where order_id=$1 order by created_at", [id]), comm: await db.one("select * from commissions where order_id=$1", [id]), estimate: await commissionFor(db, o), tracker: await loadTracker(db, id) };
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
        {d.items.some((i) => i.kind === "service") && !["completed", "cancelled"].includes(o.status) && (
          <Card>
            <h2 className="font-bold">Service tracking</h2>
            <p className="text-sm text-mute">Current stage: {o.service_stage}</p>
            <Form action={updateService} resetOnSuccess className="mt-2 space-y-2">
              <input type="hidden" name="order_id" value={o.id} />
              <Field label="Stage" name="stage" as="select">{STAGES.map((s) => <option key={s}>{s}</option>)}</Field>
              <Field label="Progress note" name="note" />
              <div className="grid grid-cols-2 gap-2"><Field label="Expected completion" name="expected" type="date" /><Field label="Appointment" name="appointment" placeholder="Friday 3pm, Daniel Hall" /></div>
              <Submit size="sm">Send update</Submit>
            </Form>
            <LocationShare orderId={o.id} active />
          </Card>
        )}
        <Card>
          <h2 className="font-bold">Earnings on this order</h2>
          <dl className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-mute">Sale amount</dt><dd>{naira(d.comm?.gross_kobo ?? d.estimate.gross)}</dd></div>
            {Number(o.seller_funded_kobo) > 0 && <div className="flex justify-between"><dt className="text-mute">Discounts you funded</dt><dd>-{naira(o.seller_funded_kobo)}</dd></div>}
            <div className="flex justify-between"><dt className="text-mute">Vybe Market commission ({(d.comm?.rate_bps ?? d.estimate.rateBps) / 100}%)</dt><dd>-{naira(d.comm?.commission_kobo ?? d.estimate.fee)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Your earnings</dt><dd>{naira(d.comm?.net_kobo ?? d.estimate.net)}</dd></div>
          </dl>
          {Number(o.platform_funded_kobo) + Number(o.wallet_credit_kobo) > 0 && <p className="mt-1 text-xs text-mute">Vybe Market paid for {naira(Number(o.platform_funded_kobo) + Number(o.wallet_credit_kobo))} of this buyer's discounts. That doesn't affect your earnings.</p>}
          {o.payment_method === "pay_on_pickup" && <p className="mt-1 text-xs text-mute">You collect this in person, so the commission is charged against your balance.</p>}
        </Card>
        <Card><h2 className="font-bold">Timeline</h2><ul className="mt-1 text-sm">{d.events.map((e) => <li key={e.id} className="flex justify-between gap-2 py-1"><span>{ORDER_STATUS_LABEL[e.status]}{e.note ? `: ${e.note}` : ""}</span><span className="text-mute">{dateTime(e.created_at)}</span></li>)}</ul></Card>
      </div>
      <Card className="h-fit">
        <h2 className="font-bold">Customer</h2><p>{o.full_name}</p><p className="text-sm text-mute">{o.email}</p>{o.phone && <p className="text-sm text-mute">{o.phone}</p>}
        <h2 className="mt-3 font-bold">Campus pickup</h2>
        {["completed", "cancelled"].includes(o.status) ? <p>{o.pickup_point}</p> : (
          <Form action={updatePickup} className="mt-1 space-y-2">
            <input type="hidden" name="order_id" value={o.id} />
            <Field label="Pickup point" name="pickup_point" defaultValue={o.pickup_point} />
            <Field label="Date" name="pickup_date" type="date" defaultValue={o.pickup_date ? new Date(o.pickup_date).toISOString().slice(0, 10) : ""} />
            <Field label="Time" name="pickup_window" defaultValue={o.pickup_window ?? ""} />
            <Field label="Instructions" name="pickup_instructions" defaultValue={o.pickup_instructions ?? ""} />
            <Submit size="sm" variant="outline">Update pickup</Submit>
          </Form>
        )}
        {o.buyer_note && <p className="mt-1 text-sm text-mute">Note: {o.buyer_note}</p>}
        {o.convo && <Link href={`/messages/${o.convo}`} className="mt-3 inline-block font-semibold text-palm-deep underline">Open conversation</Link>}
      </Card>
    </div>
  );
}
