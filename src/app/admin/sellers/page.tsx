import { reviewSeller } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { Badge, Card, Empty, PageHead, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Seller approvals" };
export default async function S() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows(
    `select p.*, u.full_name, u.email, u.student_status from seller_profiles p join users u on u.id=p.user_id where p.status='pending' order by p.created_at`));
  return (
    <>
      <PageHead title="Seller approvals" />
      {rows.length === 0 ? <Empty title="No applications waiting" /> : <div className="grid gap-3 md:grid-cols-2">{rows.map((s) => (
        <Card key={s.user_id}>
          <p className="font-semibold">{s.business_name}</p><p className="text-sm text-mute">{s.full_name}, {s.email}</p>
          <p className="mt-1 text-sm"><Badge>{s.business_type}</Badge> <Badge tone={statusTone(s.student_status)}>Student: {s.student_status}</Badge></p>
          <p className="mt-2 text-ink-3">{s.pitch}</p>
          <div className="mt-3 flex gap-2">
            <ActionButton action={reviewSeller} values={{ user_id: s.user_id, decision: "approved" }} variant="primary">Approve seller</ActionButton>
            <ActionButton action={reviewSeller} values={{ user_id: s.user_id, decision: "rejected", note: "Your application needs more detail." }} variant="danger" confirm="Decline this application?">Decline</ActionButton>
          </div>
        </Card>
      ))}</div>}
    </>
  );
}
