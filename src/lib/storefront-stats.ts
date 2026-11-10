import { createHash } from "node:crypto";
import { asSystem, type Db } from "./db";

const day = () => new Date().toISOString().slice(0, 10);
/** Changes every day, so the same browser can't be followed from one day to the next. */
const visitorHash = (storefrontId: string, visitorId: string) =>
  createHash("sha256").update(`${day()}|${process.env.ANALYTICS_SALT ?? process.env.CRON_SECRET ?? process.env.DATABASE_URL ?? "vybe"}|${storefrontId}|${visitorId}`).digest("hex");

const bump = (db: Db, storefrontId: string, col: "visits" | "unique_visitors" | "product_clicks") =>
  db.run(`insert into storefront_daily_stats(storefront_id, ${col}) values ($1,1) on conflict (storefront_id, day) do update set ${col} = storefront_daily_stats.${col} + 1`, [storefrontId]);

export const SOURCES = ["direct", "vybe", "whatsapp", "instagram", "tiktok", "x", "facebook", "google", "other"] as const;
export type Source = (typeof SOURCES)[number];
/** Buckets a referring host into a few named sources. Only the bucket is stored. */
export function sourceOf(refHost: string | null | undefined, ownHost?: string | null): Source {
  const h = (refHost ?? "").toLowerCase().replace(/^www\./, "").replace(/^m\./, "").replace(/^l\./, "").replace(/^lm\./, "");
  if (!h) return "direct";
  if (ownHost && h === ownHost.toLowerCase().replace(/^www\./, "")) return "vybe";
  if (h.endsWith("vercel.app") && h.includes("vybe")) return "vybe";
  if (h === "wa.me" || h.endsWith("whatsapp.com") || h.endsWith("whatsapp.net")) return "whatsapp";
  if (h.endsWith("instagram.com")) return "instagram";
  if (h.endsWith("tiktok.com")) return "tiktok";
  if (h === "x.com" || h === "t.co" || h.endsWith("twitter.com")) return "x";
  if (h.endsWith("facebook.com") || h === "fb.me") return "facebook";
  if (/(^|\.)google\./.test(h) || h.endsWith("bing.com") || h.endsWith("duckduckgo.com")) return "google";
  return "other";
}

/** One store page view. A single browser stops counting after 60 views a day. */
export async function recordVisit(storefrontId: string, visitorId: string, userId: string | null, where?: { source: Source; device: "mobile" | "desktop" }) {
  await asSystem(async (db) => {
    const s = await db.one("select owner_id from storefronts where id=$1 and status='active'", [storefrontId]);
    if (!s || s.owner_id === userId) return;
    const v = await db.one<{ hits: number }>(
      `insert into storefront_visitor_days(storefront_id, visitor_hash) values ($1,$2)
       on conflict (storefront_id, day, visitor_hash) do update set hits = storefront_visitor_days.hits + 1 returning hits`, [storefrontId, visitorHash(storefrontId, visitorId)]);
    if (!v || v.hits > 60) return;
    await bump(db, storefrontId, "visits");
    if (v.hits === 1) await bump(db, storefrontId, "unique_visitors");
    if (where) await db.run(
      `insert into storefront_daily_sources(storefront_id, source, device, visits) values ($1,$2,$3,1)
       on conflict (storefront_id, day, source, device) do update set visits = storefront_daily_sources.visits + 1`, [storefrontId, where.source, where.device]);
    if (userId) await db.run("insert into storefront_member_visits(storefront_id, user_id) values ($1,$2) on conflict do nothing", [storefrontId, userId]);
  });
}

/** A click on a product from the store page. Only counted for a browser that has visited today. */
export async function recordClick(storefrontId: string, visitorId: string, userId: string | null) {
  await asSystem(async (db) => {
    const v = await db.one<{ hits: number }>(
      `update storefront_visitor_days v set hits = v.hits + 1 from storefronts s
       where s.id = v.storefront_id and s.owner_id is distinct from $3 and v.storefront_id=$1 and v.day=current_date and v.visitor_hash=$2 returning v.hits`,
      [storefrontId, visitorHash(storefrontId, visitorId), userId]);
    if (v && v.hits <= 200) await bump(db, storefrontId, "product_clicks");
  });
}

export type StoreStats = {
  days: { day: string; visits: number; unique_visitors: number; product_clicks: number }[];
  visits: number; unique: number; clicks: number; enquiries: number; orders: number; salesKobo: number; conversion: number | null;
  productViews: number; topProducts: { title: string; slug: string; views: number; enquiries: number }[];
  sources: { source: Source; visits: number }[]; devices: { device: string; visits: number }[];
};
/** Caller must already have checked that the viewer owns this storefront (or is an admin). */
export async function storeStats(storefrontId: string, days: number): Promise<StoreStats> {
  return asSystem(async (db) => {
    const rows = await db.rows(
      `select to_char(g.day,'YYYY-MM-DD') as day, coalesce(s.visits,0)::int visits, coalesce(s.unique_visitors,0)::int unique_visitors, coalesce(s.product_clicks,0)::int product_clicks
       from generate_series(current_date - ($2::int - 1), current_date, interval '1 day') g(day)
       left join storefront_daily_stats s on s.storefront_id=$1 and s.day = g.day::date order by g.day`, [storefrontId, days]);
    const enq = await db.one("select count(*)::int n from conversations where storefront_id=$1 and created_at > current_date - ($2::int - 1)", [storefrontId, days]);
    const sales = await db.one(
      `select count(*)::int n, coalesce(sum(o.total_kobo),0)::bigint total from orders o
       where o.storefront_id=$1 and o.status='completed' and o.created_at > current_date - ($2::int - 1)
         and exists(select 1 from storefront_member_visits v where v.storefront_id=o.storefront_id and v.user_id=o.buyer_id
                    and v.day between o.created_at::date - 7 and o.created_at::date)`, [storefrontId, days]);
    const since = [storefrontId, days];
    const [pv, top, sources, devices] = await Promise.all([
      db.one(`select coalesce(sum(d.views),0)::int n from listing_daily_stats d join listings l on l.id=d.listing_id where l.storefront_id=$1 and d.day > current_date - $2::int`, since),
      db.rows(`select l.title, l.slug, sum(d.views)::int views, sum(d.enquiries)::int enquiries from listing_daily_stats d join listings l on l.id=d.listing_id
               where l.storefront_id=$1 and d.day > current_date - $2::int group by l.id order by views desc, enquiries desc limit 5`, since),
      db.rows(`select source, sum(visits)::int visits from storefront_daily_sources where storefront_id=$1 and day > current_date - $2::int group by 1 order by 2 desc`, since),
      db.rows(`select device, sum(visits)::int visits from storefront_daily_sources where storefront_id=$1 and day > current_date - $2::int group by 1 order by 2 desc`, since),
    ]);
    const sum = (k: "visits" | "unique_visitors" | "product_clicks") => rows.reduce((a, r) => a + r[k], 0);
    const unique = sum("unique_visitors");
    return {
      days: rows as StoreStats["days"], visits: sum("visits"), unique, clicks: sum("product_clicks"), enquiries: enq.n, orders: sales.n, salesKobo: Number(sales.total),
      conversion: unique ? sales.n / unique : null, productViews: pv.n, topProducts: top as StoreStats["topProducts"],
      sources: sources as StoreStats["sources"], devices: devices as StoreStats["devices"],
    };
  });
}

export const pruneStats = (db: Db) => Promise.all([
  db.run("delete from storefront_visitor_days where day < current_date - 1"),
  db.run("delete from storefront_member_visits where day < current_date - 100"),
]);
