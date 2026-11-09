import Link from "next/link";
import { setFeatured, setStoreStatus } from "@/app/actions/admin-storefront";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead, statusTone } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Storefronts" };
export default async function Storefronts({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; reported?: string }> }) {
  const a = await requireAdmin();
  const q = await searchParams;
  const rows = await asUser(a.id, (db) => db.rows(
    `select s.id, s.name, s.slug, s.status, s.status_reason, s.is_featured, s.created_at, u.full_name owner, u.email,
       (select code from effective_plan(s.owner_id)) plan,
       (select count(*)::int from reports r where r.target_type='storefront' and r.target_id=s.id and r.status='open') reports,
       (select count(*)::int from storefront_media m where m.storefront_id=s.id and m.status='active') media,
       d.published_at, t.name template
     from storefronts s join users u on u.id=s.owner_id left join storefront_designs d on d.storefront_id=s.id left join storefront_templates t on t.id=d.template_id
     where ($1::text is null or s.name ilike '%'||$1||'%' or s.slug ilike '%'||$1||'%' or u.email ilike '%'||$1||'%')
       and ($2::text is null or s.status::text=$2)
       and ($3::text is null or exists(select 1 from reports r where r.target_type='storefront' and r.target_id=s.id and r.status='open'))
     order by s.is_featured desc, s.created_at desc limit 100`, [q.q || null, q.status || null, q.reported ? "1" : null]));
  return (
    <>
      <PageHead title="Storefronts" sub="Hide, suspend or feature stores, and review what sellers upload." action={<Link className="font-semibold underline" href="/admin/storefronts/media">Uploaded media</Link>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">Search<input name="q" defaultValue={q.q} className="input mt-1 py-2" placeholder="Name, slug or owner email" /></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={q.status ?? ""} className="input mt-1 py-2"><option value="">Any</option><option>active</option><option>hidden</option><option>suspended</option></select></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="reported" value="1" defaultChecked={!!q.reported} />Reported only</label>
        <button className="rounded-lg bg-palm px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      {rows.length === 0 ? <Empty title="No storefronts match" /> : (
        <div className="space-y-2">{rows.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold"><Link className="underline" href={`/store/${s.slug}`}>{s.name}</Link> <Badge tone={statusTone(s.status)}>{s.status}</Badge>{s.is_featured && <> <Badge tone="green">Featured</Badge></>}{s.reports > 0 && <> <Badge tone="red">{s.reports} open report{s.reports > 1 ? "s" : ""}</Badge></>}</p>
                <p className="text-sm text-mute">{s.owner} · {s.email} · plan {s.plan} · {s.template ?? "default design"}{s.published_at ? `, published ${new Date(s.published_at).toLocaleDateString("en-NG")}` : ""} · {s.media} uploads</p>
                {s.status_reason && <p className="text-sm text-ink-3">Reason: {s.status_reason}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={setFeatured} values={{ id: s.id, featured: s.is_featured ? "false" : "true" }}>{s.is_featured ? "Unfeature" : "Feature"}</ActionButton>
                {s.reports > 0 && <Link href="/admin/reports" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">Reports</Link>}
                <Link href={`/admin/storefronts/media?store=${s.id}`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold">Media</Link>
              </div>
            </div>
            <Form action={setStoreStatus} toastOnly className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={s.id} />
              <Field label="Set status" name="status" as="select" defaultValue={s.status}><option value="active">Active</option><option value="hidden">Hidden</option><option value="suspended">Suspended</option></Field>
              <div className="min-w-56 flex-1"><Field label="Reason (shown to the seller)" name="reason" defaultValue={s.status_reason ?? ""} /></div>
              <Submit size="sm" variant="outline">Apply</Submit>
            </Form>
          </Card>
        ))}</div>
      )}
    </>
  );
}
