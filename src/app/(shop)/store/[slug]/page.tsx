import { MapPin, MessageCircle, Phone, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { report, sendEnquiry } from "@/app/actions/shop";
import { Field, Form, Submit } from "@/components/form";
import { CardGrid, ListingCard } from "@/components/listing-card";
import { Reveal } from "@/components/motion";
import { FavButton } from "@/components/shop-client";
import { ShareButton } from "@/components/share";
import { Badge, Empty, Img } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

type P = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const s = await asUser(null, (db) => db.one("select name, tagline from storefronts where slug=$1", [slug]));
  return s ? { title: s.name, description: s.tagline } : {};
}

export default async function Store({ params }: P) {
  const { slug } = await params;
  const u = await currentUser();
  const d = await asUser(u?.id ?? null, async (db) => {
    const s = await db.one(
      `select s.*, un.short_name, coalesce(r.rating,0) rating, coalesce(r.review_count,0) review_count
       from storefronts s join universities un on un.id=s.university_id left join storefront_ratings r on r.storefront_id=s.id where s.slug=$1`, [slug]);
    if (!s) return null;
    return {
      s,
      items: await db.rows("select * from listing_cards where storefront_id=$1 and status='active' order by sold_count desc, created_at desc", [s.id]),
      reviews: await db.rows("select r.rating, r.body, r.id, split_part(u.full_name,' ',1) author from reviews r left join users u on u.id=r.author_id where r.storefront_id=$1 and not r.is_hidden order by r.created_at desc limit 6", [s.id]),
      campaign: await db.one("select title, body, percent_off from promotional_campaigns where storefront_id=$1 and is_active and now() between starts_at and ends_at order by percent_off desc limit 1", [s.id]),
      fav: u ? !!(await db.one("select 1 from favourites where user_id=$1 and storefront_id=$2", [u.id, s.id])) : false,
    };
  });
  if (!d) notFound();
  const { s } = d;
  const products = d.items.filter((i) => i.kind === "product");
  const services = d.items.filter((i) => i.kind === "service");
  const editorial = s.layout === "editorial";
  return (
    <div style={{ "--color-palm": s.accent, "--color-palm-deep": s.accent } as React.CSSProperties}>
      <div className={`relative ${editorial ? "h-72 sm:h-96" : "h-44 sm:h-64"} overflow-hidden`}>
        <Img path={s.cover_path} alt="" className="size-full" />
      </div>
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative -mt-10 flex items-end justify-between gap-4">
          <Img path={s.logo_path} alt={`${s.name} logo`} className="size-24 rounded-2xl border-4 border-paper bg-card" />
          <div className="flex items-center gap-2"><ShareButton /><FavButton storefrontId={s.id} initial={d.fav} /></div>
        </div>
        <h1 className="mt-3 text-3xl font-bold">{s.name}</h1>
        {s.tagline && <p className="text-ink-3">{s.tagline}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
          <span>{s.short_name}</span>
          {s.review_count > 0 && <span className="flex items-center gap-1"><Star size={14} className="fill-sun text-sun" aria-hidden />{Number(s.rating).toFixed(1)} ({s.review_count})</span>}
          {s.campus_location && <span className="flex items-center gap-1"><MapPin size={14} aria-hidden />{s.campus_location}</span>}
          {s.contact_phone && <a href={`tel:${s.contact_phone}`} className="flex items-center gap-1 hover:text-ink"><Phone size={14} aria-hidden />{s.contact_phone}</a>}
          {s.is_sample && <Badge tone="amber">Sample storefront</Badge>}
        </div>
        {s.announcement && <p className="mt-4 rounded-xl px-4 py-2.5 font-medium text-white" style={{ background: s.accent }}>{s.announcement}</p>}
        {d.campaign && <div className="mt-4 rounded-tag bg-mint p-4"><p className="display text-lg font-bold">{d.campaign.title}: {d.campaign.percent_off}% off everything</p>{d.campaign.body && <p className="text-sm text-ink-3">{d.campaign.body}</p>}</div>}
        {s.description && <p className="mt-5 max-w-2xl leading-relaxed text-ink-3">{s.description}</p>}

        {d.items.length === 0 && <div className="mt-8"><Empty title="Nothing listed yet" body="Check back soon or send the seller a message." /></div>}
        {products.length > 0 && <Reveal className="mt-10"><h2 className="mb-4 text-2xl font-bold">Products</h2><CardGrid>{products.map((l) => <ListingCard key={l.id} l={l} />)}</CardGrid></Reveal>}
        {services.length > 0 && <Reveal className="mt-10"><h2 className="mb-4 text-2xl font-bold">Services</h2><CardGrid>{services.map((l) => <ListingCard key={l.id} l={l} />)}</CardGrid></Reveal>}

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-2xl font-bold">Reviews</h2>
            {d.reviews.length === 0 ? <p className="text-mute">No reviews yet.</p> : d.reviews.map((r) => (
              <div key={r.id} className="mb-2 rounded-tag border border-line bg-card p-3">
                <p className="text-sm font-semibold">{r.author ?? "Verified buyer"}, {r.rating}/5</p>
                {r.body && <p className="text-sm text-ink-3">{r.body}</p>}
              </div>
            ))}
          </section>
          {s.owner_id !== u?.id && (
            <section className="rounded-tag border border-line bg-card p-4">
              <h2 className="flex items-center gap-2 text-xl font-bold"><MessageCircle size={20} aria-hidden />Message {s.name}</h2>
              <Form action={sendEnquiry} className="mt-2 space-y-2">
                <input type="hidden" name="storefront_id" value={s.id} /><input type="hidden" name="back" value={`/store/${s.slug}`} />
                <Field label="Your message" name="body" as="textarea" rows={3} />
                <Submit variant="dark">Send message</Submit>
              </Form>
            </section>
          )}
        </div>
        {u && s.owner_id !== u.id && (
          <details className="mt-8 text-sm text-mute">
            <summary className="cursor-pointer">Report this business</summary>
            <Form action={report} resetOnSuccess className="mt-2 max-w-sm space-y-2">
              <input type="hidden" name="target_type" value="storefront" /><input type="hidden" name="target_id" value={s.id} />
              <Field label="What's wrong?" name="reason" as="select"><option>Scam or fraud</option><option>Impersonation</option><option>Offensive content</option></Field>
              <Field label="Details" name="details" as="textarea" rows={2} />
              <Submit variant="outline" size="sm">Send report</Submit>
            </Form>
          </details>
        )}
      </div>
    </div>
  );
}
