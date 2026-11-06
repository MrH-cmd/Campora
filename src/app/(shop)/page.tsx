import { BookOpen, Camera, Code, Footprints, Laptop, MapPin, PenTool, Scissors, Shirt, Sparkles, Tag, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { CardGrid, ListingCard } from "@/components/listing-card";
import { PublicLive } from "@/components/live-stats";
import { Float, Reveal, WordsIn } from "@/components/motion";
import { Img, LinkButton, Price } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

const ICONS: Record<string, typeof Tag> = { Shirt, Footprints, UtensilsCrossed, Laptop, Sparkles, BookOpen, PenTool, Camera, Scissors, Code };
const BASE = "select * from listing_cards where status='active' and ($1::uuid is null or university_id=$1)";

export default async function Home() {
  const u = await currentUser();
  const uni = u?.university_id ?? null;
  const d = await asUser(u?.id ?? null, async (db) => {
    const [cats, sponsored, popular, fresh, services, stores, campaigns, boostedStores] = [
      await db.rows("select * from categories where is_active order by kind, sort limit 12"),
      await db.rows(`${BASE} and featured order by random() limit 5`, [uni]),
      await db.rows(`${BASE} and kind='product' order by sold_count desc, rating desc limit 5`, [uni]),
      await db.rows(`${BASE} and kind='product' order by created_at desc limit 5`, [uni]),
      await db.rows(`${BASE} and kind='service' order by sold_count desc, rating desc limit 5`, [uni]),
      await db.rows(
        `select s.*, coalesce(r.rating,0) rating, coalesce(r.review_count,0) review_count,
           (select count(*)::int from listings l where l.storefront_id=s.id and l.status='active') items,
           (select coalesce(sum(i.quantity),0)::int from order_items i join orders o on o.id=i.order_id where o.storefront_id=s.id and o.created_at > now()-interval '30 days') recent
         from storefronts s left join storefront_ratings r on r.storefront_id=s.id
         where s.status='active' and ($1::uuid is null or s.university_id=$1) order by recent desc, rating desc limit 4`, [uni]),
      await db.rows(
        `select * from promotional_campaigns where is_active and now() between starts_at and ends_at and storefront_id is null order by created_at desc limit 2`),
      await db.rows(
        `select s.name, s.slug, s.tagline, s.logo_path from store_boosts b join storefronts s on s.id=b.storefront_id
         where b.status='active' and b.ends_at>now() and b.placement='storefront_promoted' and s.status='active' limit 3`),
    ];
    let recommended: any[] = [];
    let favs = new Set<string>();
    if (u) {
      favs = new Set((await db.rows("select listing_id from favourites where user_id=$1 and listing_id is not null", [u.id])).map((r) => r.listing_id));
      recommended = await db.rows(
        `${BASE} and category_id in (
           select l.category_id from listings l join favourites f on f.listing_id=l.id where f.user_id=$2
           union select l.category_id from listings l join order_items i on i.listing_id=l.id join orders o on o.id=i.order_id where o.buyer_id=$2)
         and id not in (select listing_id from favourites where user_id=$2 and listing_id is not null)
         order by rating desc, created_at desc limit 5`, [uni, u.id]);
    }
    const tags = (popular.length ? popular : fresh).slice(0, 3);
    const uniRow = await db.one("select pickup_points from universities where is_active order by created_at limit 1");
    const pickups: string[] = (uniRow?.pickup_points ?? []).slice(0, 5);
    return { pickups, cats, sponsored, popular, fresh, services, stores, campaigns, boostedStores, recommended, favs, tags };
  });

  return (
    <>
      <section className="aurora relative overflow-hidden bg-panel text-white">
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-12 md:grid-cols-[1.25fr_1fr] md:pb-20 md:pt-20">
          <div>
            <WordsIn text="All your campus needs, in one app." className="max-w-xl text-[2.9rem] font-bold leading-[1.02] sm:text-6xl lg:text-7xl" />
            <p className="mt-5 max-w-md text-lg text-white/75">Buy, sell and book from students at your university.</p>
            <form action="/search" role="search" className="mt-7 flex max-w-lg gap-2">
              <input name="q" aria-label="Search products, services and businesses" placeholder="What do you need?" className="h-14 w-full rounded-2xl border border-line bg-card px-4 text-ink outline-none transition focus:border-palm focus:ring-4 focus:ring-palm/40" />
              <button className="shine h-14 shrink-0 rounded-2xl bg-palm px-6 font-semibold transition hover:bg-palm-hover active:scale-95">Search</button>
            </form>
            <PublicLive className="mt-5 text-white/80" />
          </div>
          <div className="relative hidden min-h-[470px] md:block">
            {d.tags.length > 0 ? d.tags.map((l, i) => (
              <Float key={l.id} delay={.15 + i * .15} duration={6 + i} rotate={[-5, 4, -2][i]} className={["absolute left-0 top-0 w-48", "absolute right-0 top-14 w-44", "absolute bottom-0 left-[26%] w-44"][i]}>
                <Link href={`/listing/${l.slug}`} className="block rounded-tag border border-line bg-card p-2 text-ink shadow-2xl">
                  <Img path={l.cover} alt={l.title} className="aspect-[5/4] w-full rounded-xl" />
                  <div className="px-1.5 pb-1 pt-2">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <Price kobo={l.effective_price_kobo} was={l.price_kobo} className="text-sm" />
                  </div>
                </Link>
              </Float>
            )) : d.pickups.map((name: string, i: number) => (
              <Float key={name} delay={.15 + i * .12} duration={5 + i} y={8 + i * 2} rotate={[-4, 3, -2, 4, -3][i]} className={["absolute left-2 top-4", "absolute right-2 top-24", "absolute left-[14%] top-[45%]", "absolute right-[6%] top-[62%]", "absolute bottom-2 left-[28%]"][i]}>
                <span className="tag-notch inline-flex items-center gap-2 bg-card/90 px-5 py-3 font-medium text-ink shadow-2xl"><MapPin size={16} className="text-palm-deep" aria-hidden />{name}</span>
              </Float>
            ))}
          </div>
        </div>
      </section>

      <div aria-hidden className="overflow-hidden border-y border-line bg-panel-2 py-2.5 text-sm font-semibold text-palm-deep">
        <div className="marquee">
          {[0, 1].map((k) => <span key={k} className="flex shrink-0">{Array.from({ length: 8 }, (_, i) => <span key={i} className="px-6">Buy<i className="px-3 not-italic text-white/40">/</i>Sell<i className="px-3 not-italic text-white/40">/</i>Discover<i className="px-3 not-italic text-white/40">/</i>Connect<i className="px-3 not-italic text-white/40">/</i>Grow</span>)}</span>)}
        </div>
      </div>

<div className="mx-auto max-w-7xl px-4">
        <nav aria-label="Categories" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2">
          {d.cats.map((c) => {
            const I = ICONS[c.icon] ?? Tag;
            return <Link key={c.id} href={`/search?category=${c.slug}&type=${c.kind}`} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-palm"><I size={16} className="text-palm" aria-hidden />{c.name}</Link>;
          })}
        </nav>

        {d.campaigns.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {d.campaigns.map((c) => (
              <Link key={c.id} href={c.href ?? "/search"} className="group relative overflow-hidden rounded-tag bg-mint p-5 transition hover:bg-palm-hover">
                {c.is_sponsored && <span className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-3"><Sparkles size={12} aria-hidden />Sponsored</span>}
                <p className="display text-xl font-bold">{c.title}</p>
                {c.body && <p className="text-sm text-ink-3">{c.body}</p>}
              </Link>
            ))}
          </div>
        )}

        {d.popular.length === 0 && d.services.length === 0 && d.stores.length === 0 && (
          <Reveal className="mt-12 rounded-[24px] border border-dashed border-line p-8 text-center">
            <h2 className="text-2xl font-bold">No businesses are live yet</h2>
            <p className="mx-auto mt-1 max-w-md text-mute">Real student businesses will appear here as soon as they're approved. Yours could be the first.</p>
            <LinkButton href="/account/become-seller" className="mt-4">Open your storefront</LinkButton>
          </Reveal>
        )}
        <Rail title="Featured by student businesses" items={d.sponsored} favs={d.favs} sponsored />
        {d.recommended.length > 0 && <Rail title="Picked for you" items={d.recommended} favs={d.favs} />}
        <Rail title="Popular this month" items={d.popular} favs={d.favs} href="/search?type=product&sort=popular" />

        {d.stores.length > 0 && (
          <Reveal className="mt-14">
            <Head title="Trending campus businesses" href="/search?type=store" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {d.stores.map((s) => (
                <Link key={s.id} href={`/store/${s.slug}`} className="group overflow-hidden rounded-tag border border-line bg-card transition hover:-translate-y-1 hover:shadow-lg">
                  <Img path={s.cover_path} alt="" className="h-24 w-full" />
                  <div className="p-3.5">
                    <p className="font-semibold">{s.name}</p>
                    <p className="line-clamp-1 text-sm text-mute">{s.tagline}</p>
                    <p className="mt-1 text-xs text-mute">{s.items} listings{s.review_count > 0 ? `, ${Number(s.rating).toFixed(1)} stars` : ""}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Reveal>
        )}

        {d.boostedStores.length > 0 && (
          <Reveal className="mt-10 rounded-tag border border-line bg-card p-4">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-mute"><Sparkles size={12} aria-hidden />Sponsored storefronts</p>
            <div className="flex flex-wrap gap-3">
              {d.boostedStores.map((s) => <Link key={s.slug} href={`/store/${s.slug}`} className="flex items-center gap-2 font-medium hover:text-palm-deep"><Img path={s.logo_path} alt="" className="size-9 rounded-full" />{s.name}</Link>)}
            </div>
          </Reveal>
        )}

        <Rail title="Services from students" items={d.services} favs={d.favs} href="/search?type=service" />
        <Rail title="Just listed" items={d.fresh} favs={d.favs} href="/search?type=product&sort=newest" />

        <Reveal className="aurora relative mt-16 overflow-hidden rounded-[28px] border border-line bg-panel p-7 text-white sm:p-12">
          <h2 className="relative z-10 max-w-lg text-3xl font-bold sm:text-5xl">Your hustle deserves a real storefront.</h2>
          <p className="relative z-10 mt-3 max-w-md text-white/75">Open a shop for free, list up to five products or services, and manage every order in one place.</p>
          <div className="relative z-10 mt-6 flex flex-wrap gap-2">
            <LinkButton href="/account/become-seller" size="lg">Start selling</LinkButton>
            <Link href="/pricing" className="inline-flex h-13 items-center rounded-xl border border-white/30 px-6 font-semibold hover:bg-white/10">Compare plans</Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}

const Head = ({ title, href }: { title: string; href?: string }) => (
  <div className="mb-4 flex items-end justify-between">
    <h2 className="text-2xl font-bold sm:text-[1.7rem]">{title}</h2>
    {href && <Link href={href} className="text-sm font-semibold text-palm-deep hover:underline">See all</Link>}
  </div>
);

function Rail({ title, items, favs, href, sponsored }: { title: string; items: any[]; favs: Set<string>; href?: string; sponsored?: boolean }) {
  if (!items.length) return null;
  return (
    <Reveal className="mt-12">
      <Head title={title} href={href} />
      <CardGrid>{items.map((l) => <ListingCard key={l.id} l={l} faved={favs.has(l.id)} sponsored={sponsored} />)}</CardGrid>
    </Reveal>
  );
}
