import { Check } from "lucide-react";
import { notFound } from "next/navigation";
import { buyerCancel, openDispute, sendEnquiry, submitReview } from "@/app/actions/shop";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dateTime, naira, ORDER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/format";

const STEPS = ["pending", "accepted", "processing", "ready_for_pickup", "completed"];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser(`/account/orders/${id}`);
  const d = await asUser(u.id, async (db) => {
    const o = await db.one(
      "select o.*, s.name store, s.id store_id, s.slug from orders o join storefronts s on s.id=o.storefront_id where o.id=$1 and o.buyer_id=$2", [id, u.id]).catch(() => null);
    if (!o) return null;
    return {
      o,
      items: await db.rows("select i.*, r.rating from order_items i left join reviews r on r.order_item_id=i.id where i.order_id=$1", [id]),
      events: await db.rows("select * from order_events where order_id=$1 order by created_at", [id]),
      dispute: await db.one("select * from disputes where order_id=$1 order by created_at desc limit 1", [id]),
      refund: await db.one("select * from refunds where order_id=$1 order by created_at desc limit 1", [id]),
    };
  });
  if (!d) notFound();
  const { o } = d;
  const reached = new Set(d.events.map((e) => e.status));
  const open = !["completed", "cancelled"].includes(o.status);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Order {o.number}</h1>
          <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
          <Badge tone={statusTone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status]}</Badge>
        </div>
        {o.status !== "cancelled" ? (
          <Card>
            <ol className="space-y-3">
              {STEPS.map((s) => {
                const on = reached.has(s as any);
                const ev = d.events.find((e) => e.status === s);
                return (
                  <li key={s} className="flex items-center gap-3">
                    <span className={`grid size-7 place-items-center rounded-full ${on ? "bg-palm text-white" : "bg-ink/8 text-mute"}`}>{on && <Check size={15} aria-hidden />}</span>
                    <span className={on ? "font-medium" : "text-mute"}>{ORDER_STATUS_LABEL[s]}</span>
                    {ev && <span className="ml-auto text-xs text-mute">{dateTime(ev.created_at)}</span>}
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : <Card><p>This order was cancelled.{d.refund ? ` Refund status: ${d.refund.status}.` : ""}</p></Card>}
        <Card>
          <h2 className="font-bold">Items</h2>
          <ul className="mt-2 divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.id} className="py-2.5">
                <div className="flex justify-between gap-2"><span>{i.quantity} × {i.title}</span><span className="tabular-nums">{naira(i.unit_price_kobo * i.quantity)}</span></div>
                {o.status === "completed" && (i.rating ? <p className="text-sm text-mute">You rated this {i.rating}/5</p> : (
                  <Form action={submitReview} className="mt-2 space-y-2 rounded-xl bg-paper p-3">
                    <input type="hidden" name="order_item_id" value={i.id} />
                    <Field label="Rating" name="rating" as="select" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}</Field>
                    <Field label="Your review" name="body" as="textarea" rows={2} />
                    <Submit size="sm" variant="dark">Publish review</Submit>
                  </Form>
                ))}
              </li>
            ))}
          </ul>
          {Number(o.discount_kobo) > 0 && <p className="flex justify-between text-sm text-palm-deep"><span>Discount</span><span>-{naira(o.discount_kobo)}</span></p>}
          <p className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span>{naira(o.total_kobo)}</span></p>
        </Card>
      </div>
      <aside className="space-y-4">
        {open && o.payment_status !== "awaiting_payment" && (
          <Card className="bg-ink text-white">
            <p className="text-sm text-white/70">Pickup code</p>
            <p className="display text-4xl font-bold tracking-widest">{o.pickup_code}</p>
            <p className="mt-1 text-sm text-white/70">Give this to the seller only when you have your item.</p>
          </Card>
        )}
        <Card>
          <p className="text-sm text-mute">Pickup point</p><p className="font-medium">{o.pickup_point}</p>
          <Form action={sendEnquiry} className="mt-3 space-y-2">
            <input type="hidden" name="storefront_id" value={o.store_id} /><input type="hidden" name="order_id" value={o.id} />
            <Field label={`Message ${o.store}`} name="body" as="textarea" rows={2} placeholder="Arrange your pickup time" />
            <Submit size="sm" variant="dark">Send message</Submit>
          </Form>
        </Card>
        {o.status === "pending" && <ActionButton action={buyerCancel} values={{ order_id: o.id }} variant="danger" size="md" confirm="Cancel this order?">Cancel order</ActionButton>}
        {d.dispute ? <Card><p className="font-medium">Dispute: {d.dispute.status.replace("_", " ")}</p>{d.dispute.resolution && <p className="text-sm text-mute">{d.dispute.resolution}</p>}</Card> : (
          <details className="text-sm text-mute"><summary className="cursor-pointer">Problem with this order?</summary>
            <Form action={openDispute} className="mt-2 space-y-2"><input type="hidden" name="order_id" value={o.id} />
              <Field label="What happened?" name="reason" as="textarea" rows={3} /><Submit size="sm" variant="outline">Open dispute</Submit></Form>
          </details>
        )}
      </aside>
    </div>
  );
}
