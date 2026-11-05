import { resolveDispute } from "@/app/actions/admin";
import { Field, Form, Submit } from "@/components/form";
import { Card, Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, timeAgo } from "@/lib/format";

export const metadata = { title: "Disputes" };
export default async function D() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows(
    `select d.*, o.number, o.total_kobo, o.payment_status, u.full_name, s.name store from disputes d join orders o on o.id=d.order_id join users u on u.id=d.opened_by
     join storefronts s on s.id=o.storefront_id where d.status='open' order by d.created_at`));
  return (
    <>
      <PageHead title="Disputes" sub="Siding with the buyer on a paid order queues a full refund." />
      {rows.length === 0 ? <Empty title="No open disputes" /> : <div className="space-y-2">{rows.map((d) => (
        <Card key={d.id}>
          <p className="font-semibold">{d.number}, {d.store}, {naira(d.total_kobo)}</p>
          <p className="text-sm text-mute">Opened by {d.full_name}, {timeAgo(d.created_at)}</p><p className="mt-1">{d.reason}</p>
          <Form action={resolveDispute} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={d.id} />
            <Field label="Resolution" name="resolution" />
            <div className="flex items-end gap-2">
              <Field label="Outcome" name="status" as="select"><option value="resolved_buyer">In buyer's favour</option><option value="resolved_seller">In seller's favour</option><option value="closed">Close with no action</option></Field>
              <Submit size="md">Close dispute</Submit>
            </div>
          </Form>
        </Card>
      ))}</div>}
    </>
  );
}
