import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { report } from "@/app/actions/shop";
import { Field, Form, Submit } from "@/components/form";
import { StorefrontView } from "@/components/storefront/view";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadPublicView } from "@/lib/storefront";

type P = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const s = await asUser(null, (db) => db.one("select name, tagline from storefronts where slug=$1", [slug]));
  return s ? { title: s.name, description: s.tagline ?? undefined, openGraph: { title: s.name, description: s.tagline ?? undefined } } : {};
}

export default async function Store({ params }: P) {
  const { slug } = await params;
  const u = await currentUser();
  const d = await asUser(u?.id ?? null, async (db) => {
    const s = await db.one("select * from storefronts where slug=$1", [slug]);
    if (!s) return null;
    const [view, fav] = await Promise.all([
      loadPublicView(db, s),
      u ? db.one("select 1 from favourites where user_id=$1 and storefront_id=$2", [u.id, s.id]) : null,
    ]);
    return { s, view, fav: !!fav };
  });
  if (!d) notFound();
  const { s, view } = d;
  const isOwner = s.owner_id === u?.id;
  return (
    <>
      {isOwner && s.status !== "active" && (
        <p className="bg-amber-500/15 px-4 py-2 text-center text-sm font-medium">Only you can see this store right now. Status: {s.status}{s.status_reason ? ` (${s.status_reason})` : ""}.</p>
      )}
      <StorefrontView content={view.content} design={view.resolved.design} template={view.resolved.template} heroStill={view.resolved.heroStill}
        media={view.media} assets={view.assets} following={d.fav} isOwner={isOwner} stickyTop={64} />
      {u && !isOwner && (
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <details className="text-sm text-mute">
            <summary className="cursor-pointer">Report this business</summary>
            <Form action={report} resetOnSuccess className="mt-2 max-w-sm space-y-2">
              <input type="hidden" name="target_type" value="storefront" /><input type="hidden" name="target_id" value={s.id} />
              <Field label="What's wrong?" name="reason" as="select"><option>Scam or fraud</option><option>Impersonation</option><option>Offensive content</option><option>Copyrighted artwork</option></Field>
              <Field label="Details" name="details" as="textarea" rows={2} />
              <Submit variant="outline" size="sm">Send report</Submit>
            </Form>
          </details>
        </div>
      )}
    </>
  );
}
