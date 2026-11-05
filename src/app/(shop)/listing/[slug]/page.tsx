import { Flag, MessageCircle, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { report, sendEnquiry } from "@/app/actions/shop";
import { Field, Form, Submit } from "@/components/form";
import { CardGrid, ListingCard } from "@/components/listing-card";
import { AddToCart, FavButton, Gallery } from "@/components/shop-client";
import { Badge, Img, Price } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { asSystem, asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const l = await asUser(null, (db) => db.one("select title, left(description,150) d from listing_cards where slug=$1 and status='active'", [slug]));
  return l ? { title: l.title, description: l.d } : {};
}

export default async function ListingPage({ params }: P) {
  const { slug } = await params;
  const u = await currentUser();
  const d = await asUser(u?.id ?? null, async (db) => {
    const l = await db.one("select * from listing_cards where slug=$1", [slug]);
    if (!l) return null;
    return {
      l,
      images: await db.rows("select path from listing_images where listing_id=$1 order by position", [l.id]),
      store: await db.one("select s.*, coalesce(r.rating,0) rating, coalesce(r.review_count,0) review_count from storefronts s left join storefront_ratings r on r.storefront_id=s.id where s.id=$1", [l.storefront_id]),
      detail: await db.one(l.kind === "product" ? "select * from products where listing_id=$1" : "select * from services where listing_id=$1", [l.id]),
      reviews: await db.rows("select r.*, split_part(u.full_name,' ',1) author from reviews r left join users u on u.id=r.author_id where r.listing_id=$1 and not r.is_hidden order by r.created_at desc limit 20", [l.id]),
      more: await db.rows("select * from listing_cards where storefront_id=$1 and id<>$2 and status='active' limit 4", [l.storefront_id, l.id]),
      fav: u ? !!(await db.one("select 1 from favourites where user_id=$1 and listing_id=$2", [u.id, l.id])) : false,
    };
  });
  if (!d) notFound();
  const { l, store } = d;
  if (l.status === "active") await asSystem((db) => db.run(
    "insert into listing_daily_stats(listing_id,views) values ($1,1) on conflict (listing_id,day) do update set views=listing_daily_stats.views+1", [l.id]));
  const canCart = l.kind === "product" || l.price_type === "fixed";
  const isOwner = store.owner_id === u?.id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {l.status !== "active" && <p className="mb-4 rounded-xl bg-sun/30 px-4 py-2 text-sm">This listing isn't public right now. Only you can see it.</p>}
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery images={d.images} title={l.title} />
        <div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/search?category=${l.category_slug}`}><Badge>{l.category_name}</Badge></Link>
            <Badge tone={l.in_stock ? "green" : "red"}>
              {l.kind === "product" ? (l.in_stock ? `${l.stock} in stock` : "Sold out") : l.in_stock ? "Taking bookings" : "Fully booked"}
            </Badge>
            {l.is_sample && <Badge tone="amber">Sample listing</Badge>}
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold leading-tight">{l.title}</h1>
            <FavButton listingId={l.id} initial={d.fav} />
          </div>
          <div className="tag-notch mt-3 inline-block bg-mint px-5 py-2 text-2xl"><Price kobo={l.effective_price_kobo} was={l.price_kobo} from={l.price_type === "starting_from"} /></div>
          {l.campaign_title && <p className="mt-2 text-sm font-medium text-palm-deep">{l.campaign_title}</p>}
          {l.review_count > 0 && <p className="mt-2 flex items-center gap-1 text-sm"><Star size={15} className="fill-sun text-sun" aria-hidden />{Number(l.rating).toFixed(1)} from {l.review_count} review{l.review_count > 1 ? "s" : ""}</p>}
          <p className="mt-4 whitespace-pre-line leading-relaxed text-ink-3">{l.description}</p>
          {l.kind === "service" && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {d.detail?.availability && <div><dt className="text-mute">Availability</dt><dd className="font-medium">{d.detail.availability}</dd></div>}
              {d.detail?.turnaround && <div><dt className="text-mute">Turnaround</dt><dd className="font-medium">{d.detail.turnaround}</dd></div>}
            </dl>
          )}
          {l.kind === "product" && <p className="mt-3 text-sm text-mute">Condition: {d.detail?.item_condition?.replace("_", " ")}</p>}

          {!isOwner && l.status === "active" && canCart && (
            <div className="mt-5"><AddToCart listingId={l.id} disabled={!l.in_stock} max={l.kind === "product" ? Math.max(l.stock, 1) : 5} label={l.kind === "service" ? "Book this service" : "Add to cart"} /></div>
          )}
          {isOwner && <Link href={`/seller/listings/${l.id}`} className="mt-5 inline-block font-semibold text-palm-deep underline">Edit this listing</Link>}

          <Link href={`/store/${store.slug}`} className="mt-5 flex items-center gap-3 rounded-tag border border-line bg-white p-3 hover:border-palm">
            <Img path={store.logo_path} alt="" className="size-12 rounded-xl" />
            <div><p className="font-semibold">{store.name}</p><p className="text-sm text-mute">{l.university_short}{store.review_count > 0 ? `, ${Number(store.rating).toFixed(1)} stars` : ""}</p></div>
          </Link>

          {!isOwner && (
            <details className="mt-3 rounded-tag border border-line bg-white p-3" open={!canCart}>
              <summary className="flex cursor-pointer items-center gap-2 font-semibold"><MessageCircle size={17} aria-hidden />Ask the seller</summary>
              <Form action={sendEnquiry} className="mt-2 space-y-2">
                <input type="hidden" name="storefront_id" value={store.id} /><input type="hidden" name="listing_id" value={l.id} /><input type="hidden" name="back" value={`/listing/${l.slug}`} />
                <Field label="Your message" name="body" as="textarea" rows={3} defaultValue={`Hi, is "${l.title}" still available?`} />
                <Submit variant="dark">Send enquiry</Submit>
              </Form>
            </details>
          )}
        </div>
      </div>

      <section className="mt-12" aria-labelledby="reviews">
        <h2 id="reviews" className="text-2xl font-bold">Reviews</h2>
        {d.reviews.length === 0 ? <p className="mt-2 text-mute">No reviews yet. Reviews come from buyers with completed orders.</p> : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {d.reviews.map((r) => (
              <li key={r.id} className="rounded-tag border border-line bg-white p-4">
                <p className="flex items-center gap-1 text-sm font-semibold">{r.author ?? "Campora buyer"}
                  <span className="ml-1 flex" aria-label={`${r.rating} out of 5`}>{Array.from({ length: r.rating }, (_, i) => <Star key={i} size={13} className="fill-sun text-sun" aria-hidden />)}</span>
                  <span className="ml-auto text-xs font-normal text-mute">{shortDate(r.created_at)}</span></p>
                {r.body && <p className="mt-1 text-ink-3">{r.body}</p>}
                {r.is_sample && <p className="mt-1 text-xs text-mute">Sample review</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.more.length > 0 && <section className="mt-12"><h2 className="mb-4 text-2xl font-bold">More from {store.name}</h2><CardGrid>{d.more.map((m) => <ListingCard key={m.id} l={m} />)}</CardGrid></section>}

      {u && !isOwner && (
        <details className="mt-10 text-sm text-mute">
          <summary className="inline-flex cursor-pointer items-center gap-1"><Flag size={14} aria-hidden />Report this listing</summary>
          <Form action={report} resetOnSuccess className="mt-2 max-w-sm space-y-2">
            <input type="hidden" name="target_type" value="listing" /><input type="hidden" name="target_id" value={l.id} />
            <Field label="What's wrong?" name="reason" as="select"><option>Scam or fraud</option><option>Prohibited item</option><option>Misleading listing</option><option>Offensive content</option></Field>
            <Field label="Details" name="details" as="textarea" rows={2} />
            <Submit variant="outline" size="sm">Send report</Submit>
          </Form>
        </details>
      )}
    </div>
  );
}
