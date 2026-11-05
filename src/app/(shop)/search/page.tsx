import Link from "next/link";
import { CardGrid, ListingCard } from "@/components/listing-card";
import { Empty, Img, Pager, buttonClass } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { toKobo } from "@/lib/format";

export const metadata = { title: "Search" };
const PER = 20;

export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const u = await currentUser();
  const type = p.type === "service" || p.type === "store" ? p.type : p.type === "product" ? "product" : "all";
  const page = Math.max(1, Number(p.page) || 1);
  const q = p.q?.trim() ?? "";

  const { rows, cats, unis, favs } = await asUser(u?.id ?? null, async (db) => {
    const cats = await db.rows("select slug,name,kind from categories where is_active order by kind, sort");
    const unis = await db.rows("select id,short_name,slug from universities where is_active order by name");
    const uni = unis.find((x) => x.slug === p.university)?.id ?? null;
    const favs = new Set(u ? (await db.rows("select listing_id from favourites where user_id=$1 and listing_id is not null", [u.id])).map((r) => r.listing_id) : []);
    if (type === "store") {
      const rows = await db.rows(
        `select s.*, un.short_name, coalesce(r.rating,0) rating, coalesce(r.review_count,0) review_count
         from storefronts s join universities un on un.id=s.university_id left join storefront_ratings r on r.storefront_id=s.id
         where s.status='active' and ($1='' or s.name ilike '%'||$1||'%' or s.tagline ilike '%'||$1||'%' or s.description ilike '%'||$1||'%')
           and ($2::uuid is null or s.university_id=$2)
         order by rating desc, s.name limit $3 offset $4`, [q, uni, PER + 1, (page - 1) * PER]);
      return { rows, cats, unis, favs };
    }
    const where = ["status='active'"]; const args: unknown[] = [];
    const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
    if (q) { args.push(q); where.push(`(search @@ websearch_to_tsquery('english',$${args.length}) or title ilike '%'||$${args.length}||'%' or store_name ilike '%'||$${args.length}||'%')`); }
    if (type !== "all") add("kind=?", type);
    if (p.category) add("category_slug=?", p.category);
    if (uni) add("university_id=?", uni);
    if (Number(p.min) > 0) add("effective_price_kobo>=?", toKobo(p.min!));
    if (Number(p.max) > 0) add("effective_price_kobo<=?", toKobo(p.max!));
    if (p.available === "1") where.push("in_stock");
    const order = { price_asc: "effective_price_kobo asc", price_desc: "effective_price_kobo desc", popular: "sold_count desc, rating desc", newest: "created_at desc" }[p.sort ?? ""]
      ?? (q ? `ts_rank(search, websearch_to_tsquery('english',$1)) desc, created_at desc` : "created_at desc");
    args.push(PER + 1, (page - 1) * PER);
    const rows = await db.rows(
      `select * from listing_cards where ${where.join(" and ")} order by search_boosted desc, ${order} limit $${args.length - 1} offset $${args.length}`, args);
    return { rows, cats, unis, favs };
  });

  const hasNext = rows.length > PER;
  const shown = rows.slice(0, PER);
  const tab = (t: string, label: string) => (
    <Link key={t} href={`/search?${new URLSearchParams({ ...(q ? { q } : {}), type: t })}`} aria-current={type === t ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${type === t ? "bg-panel text-white" : "bg-card text-ink-3 border border-line"}`}>{label}</Link>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{q ? `Results for "${q}"` : "Browse Vybe Market"}</h1>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{tab("all", "Everything")}{tab("product", "Products")}{tab("service", "Services")}{tab("store", "Businesses")}</div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[230px_1fr]">
        <details className="rounded-tag border border-line bg-card p-4 lg:h-fit" open={undefined}>
          <summary className="cursor-pointer font-semibold">Filters and sort</summary>
          <form className="mt-3 space-y-3 text-sm">
            {q && <input type="hidden" name="q" value={q} />}
            <input type="hidden" name="type" value={type} />
            {type !== "store" && (
              <>
                <label className="block font-medium">Category
                  <select name="category" defaultValue={p.category ?? ""} className="input mt-1">
                    <option value="">All categories</option>
                    {cats.filter((c) => type === "all" || c.kind === type).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="font-medium">Min ₦<input name="min" inputMode="numeric" defaultValue={p.min} className="input mt-1" /></label>
                  <label className="font-medium">Max ₦<input name="max" inputMode="numeric" defaultValue={p.max} className="input mt-1" /></label>
                </div>
                <label className="block font-medium">Sort by
                  <select name="sort" defaultValue={p.sort ?? ""} className="input mt-1">
                    <option value="">Best match</option><option value="newest">Recently added</option><option value="popular">Most popular</option>
                    <option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="available" value="1" defaultChecked={p.available === "1"} className="size-4 accent-palm" />Available now</label>
              </>
            )}
            <label className="block font-medium">University
              <select name="university" defaultValue={p.university ?? ""} className="input mt-1">
                <option value="">All universities</option>
                {unis.map((c) => <option key={c.id} value={c.slug}>{c.short_name}</option>)}
              </select>
            </label>
            <button className={`${buttonClass("dark")} w-full`}>Apply filters</button>
          </form>
        </details>

        <div>
          {shown.length === 0 ? (
            <Empty title="Nothing matches yet" body="Try a broader word or clear a filter." action={<Link className={buttonClass("outline")} href="/search">Clear search</Link>} />
          ) : type === "store" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((s) => (
                <Link key={s.id} href={`/store/${s.slug}`} className="flex items-center gap-3 rounded-tag border border-line bg-card p-3 hover:border-palm">
                  <Img path={s.logo_path} alt="" className="size-14 rounded-xl" />
                  <div className="min-w-0"><p className="truncate font-semibold">{s.name}</p><p className="truncate text-sm text-mute">{s.tagline}</p><p className="text-xs text-mute">{s.short_name}</p></div>
                </Link>
              ))}
            </div>
          ) : (
            <CardGrid>{shown.map((l) => <ListingCard key={l.id} l={l} faved={favs.has(l.id)} sponsored={l.search_boosted} />)}</CardGrid>
          )}
          <Pager page={page} hasNext={hasNext} query={p} />
        </div>
      </div>
    </div>
  );
}
