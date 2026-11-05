import { resolveReport } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { Card, Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Reports" };
export default async function R() {
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows(
    `select r.*, u.full_name, l.title, l.slug, s.name store_name from reports r join users u on u.id=r.reporter_id
     left join listings l on r.target_type='listing' and l.id=r.target_id left join storefronts s on r.target_type='storefront' and s.id=r.target_id
     where r.status='open' order by r.created_at`));
  return (
    <>
      <PageHead title="Reports" />
      {rows.length === 0 ? <Empty title="No open reports" /> : <div className="space-y-2">{rows.map((r) => (
        <Card key={r.id}>
          <p className="font-semibold">{r.reason}: {r.title ? <a className="underline" href={`/listing/${r.slug}`}>{r.title}</a> : r.store_name ?? r.target_type}</p>
          <p className="text-sm text-mute">From {r.full_name}, {timeAgo(r.created_at)}</p>{r.details && <p className="mt-1">{r.details}</p>}
          <div className="mt-2 flex gap-2">
            <ActionButton action={resolveReport} values={{ id: r.id, status: "resolved", resolution: "Action taken" }} variant="primary">Mark resolved</ActionButton>
            <ActionButton action={resolveReport} values={{ id: r.id, status: "dismissed" }}>Dismiss</ActionButton>
          </div>
        </Card>
      ))}</div>}
    </>
  );
}
