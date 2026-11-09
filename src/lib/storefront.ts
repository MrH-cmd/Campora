import { asSystem, type Db } from "./db";
import { notify } from "./notify";
import { DEFAULT_TEMPLATE, designFromTemplate, type Design, type EffectDef, type Template } from "./storefront-catalog";
import { resolveDesign, type Access, type Catalog, type MediaItem, type Resolved } from "./storefront-access";
import { designSchema } from "./storefront-design";
import { mediaUrl } from "./storefront-media";

export async function loadCatalog(db: Db): Promise<Catalog> {
  const [templates, assets, plans] = await Promise.all([
    db.rows<Template>("select * from storefront_templates order by sort, name"),
    db.rows<EffectDef>("select * from animation_assets order by sort, name"),
    db.rows("select code, name, customization_level from subscription_plans"),
  ]);
  return {
    templates, assets,
    ranks: Object.fromEntries(plans.map((p) => [p.code, p.customization_level])),
    planNames: Object.fromEntries(plans.map((p) => [p.code, p.name])),
  };
}

export async function accessFor(db: Db, ownerId: string): Promise<Access> {
  const p = await db.one("select code, name, customization_level, analytics_level from effective_plan($1)", [ownerId]);
  return { level: p?.customization_level ?? 0, analyticsLevel: p?.analytics_level ?? 0, code: p?.code ?? "k-leg", name: p?.name ?? "K-Leg" };
}

export const toMediaItem = (m: any): MediaItem => ({
  id: m.id, kind: m.kind, url: mediaUrl(m.path) ?? "", posterUrl: mediaUrl(m.poster_path), status: m.status, bytes: m.bytes, duration_ms: m.duration_ms,
  created_at: m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at,
});
export async function loadMedia(db: Db, storefrontId: string, onlyActive = true) {
  const rows = await db.rows(`select * from storefront_media where storefront_id=$1 ${onlyActive ? "and status='active'" : "and status<>'pending'"} order by created_at desc`, [storefrontId]);
  return rows.map(toMediaItem);
}
export const mediaMap = (items: MediaItem[]) => new Map(items.map((m) => [m.id, m]));

/** Stores from before the builder have no design row. They get the default template in their old accent colour. */
export function defaultDesign(c: Catalog, store: { accent?: string | null; layout?: string | null }): Design {
  const t = c.templates.find((x) => x.slug === DEFAULT_TEMPLATE) ?? c.templates[0];
  const d = designFromTemplate(t);
  if (store.accent && !/^#0b8f5a$/i.test(store.accent)) d.colors.accent = store.accent;
  if (store.layout === "editorial") d.hero.height = "lg";
  return d;
}

/** Saved JSON is re-validated on the way out, so a bad row can never break a public page. */
export function readDesign(json: unknown, c: Catalog, store: { accent?: string | null; layout?: string | null }): Design {
  const r = json ? designSchema.safeParse(json) : null;
  return r?.success ? (r.data as Design) : defaultDesign(c, store);
}

export type StoreItem = {
  id: string; slug: string; title: string; kind: "product" | "service"; cover: string | null; price_kobo: number; effective_price_kobo: number;
  rating: number; review_count: number; in_stock: boolean; stock: number | null; price_type: string | null; availability: string | null; turnaround: string | null;
  condition: string | null; category: string; description: string;
};
export type StoreContent = {
  store: {
    id: string; slug: string; name: string; tagline: string | null; description: string | null; logo: string | null; cover: string | null;
    phone: string | null; whatsapp: string | null; email: string | null; location: string | null; announcement: string | null; policies: string | null;
    social: Record<string, string>; university: string; rating: number; reviewCount: number; verified: boolean; isSample: boolean;
  };
  items: StoreItem[];
  reviews: { id: string; rating: number; body: string | null; author: string | null }[];
  pickups: { id: string; name: string; instructions: string | null; available_days: string | null; time_window: string | null }[];
  campaign: { title: string; body: string | null; percent_off: number } | null;
};

export async function loadContent(db: Db, s: any): Promise<StoreContent> {
  const [items, reviews, pickups, campaign, extra, owner] = await Promise.all([
    db.rows(
      `select c.id, c.slug, c.title, c.kind, c.cover, c.price_kobo, c.effective_price_kobo, c.rating, c.review_count, c.in_stock, c.stock, c.price_type,
              c.category_name, left(c.description, 220) description, sv.availability, sv.turnaround, p.item_condition
       from listing_cards c left join services sv on sv.listing_id=c.id left join products p on p.listing_id=c.id
       where c.storefront_id=$1 and c.status='active' order by c.sold_count desc, c.created_at desc limit 120`, [s.id]),
    db.rows("select r.id, r.rating, r.body, split_part(u.full_name,' ',1) author from reviews r left join users u on u.id=r.author_id where r.storefront_id=$1 and not r.is_hidden order by r.created_at desc limit 8", [s.id]),
    db.rows("select id, name, instructions, available_days, time_window from storefront_pickup_points where storefront_id=$1 and is_active order by created_at", [s.id]),
    db.one("select title, body, percent_off from promotional_campaigns where storefront_id=$1 and is_active and now() between starts_at and ends_at order by percent_off desc limit 1", [s.id]),
    db.one("select un.short_name, coalesce(r.rating,0) rating, coalesce(r.review_count,0) review_count from universities un left join storefront_ratings r on r.storefront_id=$1 where un.id=$2", [s.id, s.university_id]),
    db.one("select student_status from users where id=$1", [s.owner_id]),
  ]);
  return {
    store: {
      id: s.id, slug: s.slug, name: s.name, tagline: s.tagline, description: s.description, logo: mediaUrl(s.logo_path), cover: mediaUrl(s.cover_path),
      phone: s.contact_phone, whatsapp: s.contact_whatsapp, email: s.contact_email, location: s.campus_location, announcement: s.announcement, policies: s.policies,
      social: s.social_links ?? {}, university: extra?.short_name ?? "", rating: Number(extra?.rating ?? 0), reviewCount: Number(extra?.review_count ?? 0),
      verified: owner?.student_status === "verified", isSample: !!s.is_sample,
    },
    items: items.map((i) => ({
      id: i.id, slug: i.slug, title: i.title, kind: i.kind, cover: mediaUrl(i.cover), price_kobo: Number(i.price_kobo), effective_price_kobo: Number(i.effective_price_kobo),
      rating: Number(i.rating), review_count: Number(i.review_count), in_stock: i.in_stock, stock: i.stock, price_type: i.price_type, availability: i.availability,
      turnaround: i.turnaround, condition: i.item_condition, category: i.category_name, description: i.description,
    })),
    reviews, pickups, campaign,
  };
}

/** The slice of the catalogue a browser needs to draw effects. */
export const clientAssets = (c: Catalog) =>
  Object.fromEntries(c.assets.map((a) => [a.slug, { renderer: a.renderer, url: mediaUrl(a.asset_path) }])) as Record<string, { renderer: EffectDef["renderer"]; url: string | null }>;

export type PublicView = { content: StoreContent; resolved: Resolved; media: MediaItem[]; assets: ReturnType<typeof clientAssets> };

/** Everything the public page needs, read as the viewer under Row Level Security. */
export async function loadPublicView(db: Db, s: any): Promise<PublicView> {
  const [catalog, access, media, pub, content] = await Promise.all([
    loadCatalog(db), accessFor(db, s.owner_id), loadMedia(db, s.id), db.one("select * from published_design($1)", [s.id]), loadContent(db, s),
  ]);
  const resolved = resolveDesign(readDesign(pub?.published, catalog, s), access, catalog, mediaMap(media));
  return { content, resolved, media, assets: clientAssets(catalog) };
}

const FALLBACK_TEXT: Record<string, string> = {
  template: "your template", banner: "your animated banner (a still image shows instead)", parallax: "the parallax banner",
  type: "custom font sizes and button style", effects: "some effects",
};
/**
 * Tells a seller once when their plan stops covering part of their published design, and clears the
 * flag when it covers everything again. The saved design itself is never changed here.
 */
export async function syncDowngrade(storefrontId: string): Promise<string[]> {
  return asSystem(async (db) => {
    const s = await db.one("select s.id, s.owner_id, s.accent, s.layout, d.published, d.downgrade_notified_at from storefronts s join storefront_designs d on d.storefront_id=s.id where s.id=$1", [storefrontId]);
    if (!s?.published) return [];
    const [catalog, access, media] = await Promise.all([loadCatalog(db), accessFor(db, s.owner_id), loadMedia(db, s.id)]);
    const { fallbacks } = resolveDesign(readDesign(s.published, catalog, s), access, catalog, mediaMap(media));
    if (fallbacks.length && !s.downgrade_notified_at) {
      const parts = [...new Set(fallbacks.map((f) => FALLBACK_TEXT[f.split(":")[0]] ?? f))].join(", ");
      await notify(db, s.owner_id, "Your storefront design changed with your plan",
        `Your ${access.name} plan no longer covers ${parts}. Your store still works and shows a simpler version. Pick replacements, or upgrade to get your design back.`, "/seller/storefront");
      await db.run("update storefront_designs set downgrade_notified_at=now() where storefront_id=$1", [s.id]);
    } else if (!fallbacks.length && s.downgrade_notified_at) {
      await db.run("update storefront_designs set downgrade_notified_at=null where storefront_id=$1", [s.id]);
    }
    return fallbacks;
  });
}
export async function syncAllDowngrades() {
  const rows = await asSystem((db) => db.rows("select storefront_id from storefront_designs where published is not null"));
  let flagged = 0;
  for (const r of rows) if ((await syncDowngrade(r.storefront_id)).length) flagged++;
  return flagged;
}
