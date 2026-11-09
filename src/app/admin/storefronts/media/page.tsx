import Link from "next/link";
import { removeStoreMedia } from "@/app/actions/admin-storefront";
import { Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { mediaUrl } from "@/lib/storefront-media";

export const metadata = { title: "Storefront media" };
export default async function StoreMedia({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const a = await requireAdmin();
  const q = await searchParams;
  const store = q.store && /^[0-9a-f-]{36}$/.test(q.store) ? q.store : null;
  const rows = await asUser(a.id, (db) => db.rows(
    `select m.*, s.name store, s.slug from storefront_media m join storefronts s on s.id=m.storefront_id
     where m.status='active' and ($1::uuid is null or m.storefront_id=$1) order by m.created_at desc limit 120`, [store]));
  return (
    <>
      <PageHead title="Storefront media" sub="Newest uploads first. Every upload was confirmed by the seller as their own artwork." action={<Link className="font-semibold underline" href="/admin/storefronts">All storefronts</Link>} />
      {rows.length === 0 ? <Empty title="No uploads to review" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((m) => {
          const url = mediaUrl(m.path); const poster = mediaUrl(m.poster_path);
          return (
            <Card key={m.id} className="space-y-2">
              <div className="aspect-video overflow-hidden rounded-lg bg-black/40">
                {m.kind === "video" ? <video src={url ?? undefined} poster={poster ?? undefined} muted controls playsInline preload="metadata" className="size-full object-cover" />
                  : m.kind === "lottie" ? <a href={url ?? "#"} className="grid h-full place-items-center text-sm underline" target="_blank" rel="noreferrer">Open Lottie JSON</a>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={url ?? ""} alt="" loading="lazy" className="size-full object-cover" />}
              </div>
              <p className="text-sm"><Link className="font-semibold underline" href={`/store/${m.slug}`}>{m.store}</Link> <Badge>{m.kind}</Badge> <span className="text-mute">{timeAgo(m.created_at)}</span></p>
              <Form action={removeStoreMedia} toastOnly className="space-y-2">
                <input type="hidden" name="id" value={m.id} />
                <Field label="Reason for removal" name="reason" defaultValue="Copyrighted or inappropriate artwork" />
                <Submit size="sm" variant="outline" confirm="Remove this file from the seller's store?">Remove</Submit>
              </Form>
            </Card>
          );
        })}</div>
      )}
    </>
  );
}
