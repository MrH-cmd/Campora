import { AtSign, BadgeCheck, CalendarClock, Camera, Clock, Globe, Mail, MapPin, MessageCircle, Phone, PlayCircle, Star, Store } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { sendEnquiry } from "@/app/actions/shop";
import { Field, Form, Submit } from "@/components/form";
import { naira } from "@/lib/format";
import { FONTS, SECTION_LABEL, type Design, type SectionId, type Template } from "@/lib/storefront-catalog";
import type { MediaItem } from "@/lib/storefront-access";
import { SOCIAL_HOSTS, socialUrl, type Social } from "@/lib/storefront-design";
import type { StoreContent, StoreItem } from "@/lib/storefront";
import { Follow, HeroMedia, ItemLink, QuickAdd, ShareStore, TrackVisit } from "./client";
import { EffectLayers, type FxAssets } from "./effects";
import "./storefront.css";

export type ViewProps = {
  content: StoreContent; design: Design; template: Pick<Template, "archetype" | "config">; heroStill?: boolean;
  media: MediaItem[]; assets: FxAssets; preview?: boolean; following?: boolean; isOwner?: boolean; stickyTop?: number;
};

const SOCIAL_LABEL: Record<Social, string> = { instagram: "Instagram", tiktok: "TikTok", x: "X", facebook: "Facebook", youtube: "YouTube", whatsapp: "WhatsApp" };
const SOCIAL_ICON: Partial<Record<Social, ReactNode>> = { instagram: <Camera size={15} aria-hidden />, tiktok: <PlayCircle size={15} aria-hidden />, x: <AtSign size={15} aria-hidden />, facebook: <Globe size={15} aria-hidden />, youtube: <PlayCircle size={15} aria-hidden />, whatsapp: <MessageCircle size={15} aria-hidden /> };

function Stars({ n }: { n: number }) {
  return <span className="sf-stars" role="img" aria-label={`${n} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} fill={i <= Math.round(n) ? "currentColor" : "none"} aria-hidden />)}</span>;
}
function Price({ i }: { i: StoreItem }) {
  return (
    <span className="sf-price">
      {i.price_type === "starting_from" && <small>from</small>}<b>{naira(i.effective_price_kobo)}</b>
      {i.price_kobo > i.effective_price_kobo && <s>{naira(i.price_kobo)}</s>}
    </span>
  );
}
const stockText = (i: StoreItem) => !i.in_stock ? "Sold out" : i.stock != null && i.stock <= 5 ? `${i.stock} left` : "In stock";
function Thumb({ i, sid, className }: { i: StoreItem; sid: string; className: string }) {
  return (
    <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className={className} label={i.title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {i.cover ? <img src={i.cover} alt="" loading="lazy" /> : <span className="sf-noimg">No photo</span>}
      {!i.in_stock && className === "sf-card-media" && <span className="sf-soldout">{i.kind === "product" ? "Sold out" : "Fully booked"}</span>}
    </ItemLink>
  );
}
function Meta({ i, d }: { i: StoreItem; d: Design }) {
  const stock = d.products.showStock && i.kind === "product"; const rating = d.products.showRating && i.review_count > 0;
  if (!stock && !rating) return null;
  return (
    <span className="sf-card-meta">
      {stock && <span data-stock>{stockText(i)}</span>}
      {rating && <span><Star size={12} fill="currentColor" aria-hidden />{i.rating.toFixed(1)} ({i.review_count})</span>}
    </span>
  );
}
function BookButtons({ i, sid }: { i: StoreItem; sid: string }) {
  return (
    <>
      <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className="sf-btn sm">{i.price_type === "starting_from" ? "Get a quote" : "Book"}</ItemLink>
      <a href="#sf-contact" className="sf-btn sm ghost">Enquire</a>
    </>
  );
}
function Card({ i, d, sid }: { i: StoreItem; d: Design; sid: string }) {
  return (
    <article className="sf-card" data-item={i.slug}>
      <Thumb i={i} sid={sid} className="sf-card-media" />
      <div className="sf-card-body">
        <Price i={i} />
        <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className="sf-card-title">{i.title}</ItemLink>
        <Meta i={i} d={d} />
        <div className="sf-card-foot">{i.kind === "product" ? <QuickAdd listingId={i.id} disabled={!i.in_stock} small /> : <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className="sf-btn sm">Book</ItemLink>}</div>
      </div>
    </article>
  );
}
function Row({ i, d, sid }: { i: StoreItem; d: Design; sid: string }) {
  return (
    <article className="sf-row" data-item={i.slug}>
      <Thumb i={i} sid={sid} className="sf-row-thumb" />
      <div className="sf-row-main">
        <h3><ItemLink href={`/listing/${i.slug}`} storefrontId={sid}>{i.title}</ItemLink></h3>
        <p>{i.description}</p><Meta i={i} d={d} />
      </div>
      <div className="sf-row-end"><Price i={i} />{i.kind === "product" ? <QuickAdd listingId={i.id} disabled={!i.in_stock} small /> : <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className="sf-btn sm">Book</ItemLink>}</div>
    </article>
  );
}

function Products({ items, d, a, sid }: { items: StoreItem[]; d: Design; a: Template["archetype"]; sid: string }) {
  if (a === "menu") {
    const cats = [...new Set(items.map((i) => i.category))];
    return <>{cats.map((c) => (
      <div key={c}>{cats.length > 1 && <p className="sf-menu-cat">{c}</p>}<div className="sf-rows">{items.filter((i) => i.category === c).map((i) => <Row key={i.id} i={i} d={d} sid={sid} />)}</div></div>
    ))}</>;
  }
  if (a === "spec") return (
    <div className="sf-spec">
      <div className="sf-spec-row head"><span /><span>Item</span><span>Condition</span><span>Stock</span><span>Rating</span><span>Price</span><span /></div>
      {items.map((i) => (
        <article key={i.id} className="sf-spec-row" data-item={i.slug}>
          <Thumb i={i} sid={sid} className="sf-row-thumb" />
          <div style={{ minWidth: 0 }}>
            <ItemLink href={`/listing/${i.slug}`} storefrontId={sid} className="sf-card-title">{i.title}</ItemLink>
            <span className="sf-spec-facts"><span>{i.category}</span>{i.condition && <span>{i.condition.replace("_", " ")}</span>}<span data-stock>{stockText(i)}</span><b style={{ color: "var(--sf-text)" }}>{naira(i.effective_price_kobo)}</b></span>
          </div>
          <span className="sf-spec-cell opt">{i.condition?.replace("_", " ") ?? "n/a"}</span>
          <span className="sf-spec-cell opt">{stockText(i)}</span>
          <span className="sf-spec-cell opt">{i.review_count ? `${i.rating.toFixed(1)} / 5` : "No reviews"}</span>
          <span className="sf-spec-cell opt"><Price i={i} /></span>
          <QuickAdd listingId={i.id} disabled={!i.in_stock} small />
        </article>
      ))}
    </div>
  );
  const [lead, ...rest] = a === "magazine" && items.length > 2 ? items : [null, ...items];
  return (
    <>
      {lead && (
        <article className="sf-lead" data-item={lead.slug}>
          <Thumb i={lead} sid={sid} className="sf-card-media" />
          <div>
            <p className="sf-kicker">Lead story</p>
            <h3><ItemLink href={`/listing/${lead.slug}`} storefrontId={sid}>{lead.title}</ItemLink></h3>
            <p className="sf-prose">{lead.description}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}><Price i={lead} /><QuickAdd listingId={lead.id} disabled={!lead.in_stock} /></div>
          </div>
        </article>
      )}
      <div className="sf-grid">{(rest as StoreItem[]).map((i) => <Card key={i.id} i={i} d={d} sid={sid} />)}</div>
    </>
  );
}

function Services({ items, sid }: { items: StoreItem[]; sid: string }) {
  return (
    <div className="sf-svc">{items.map((i) => (
      <article key={i.id} className="sf-svc-card" data-item={i.slug}>
        <Thumb i={i} sid={sid} className="sf-row-thumb" />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 19 }}><ItemLink href={`/listing/${i.slug}`} storefrontId={sid}>{i.title}</ItemLink></h3>
          <p className="sf-muted" style={{ fontSize: 14, marginTop: 4 }}>{i.description}</p>
          <div className="sf-svc-facts">
            <span className="sf-badge">{i.in_stock ? "Taking bookings" : "Fully booked"}</span>
            {i.availability && <span className="sf-badge"><CalendarClock size={12} aria-hidden />{i.availability}</span>}
            {i.turnaround && <span className="sf-badge"><Clock size={12} aria-hidden />{i.turnaround}</span>}
          </div>
        </div>
        <div className="sf-svc-foot"><Price i={i} /><span style={{ display: "flex", gap: 8 }}><BookButtons i={i} sid={sid} /></span></div>
      </article>
    ))}</div>
  );
}

/** One storefront, drawn from a design. The public page and every preview in the editor use this same component. */
export function StorefrontView({ content, design: d, template, heroStill = false, media, assets, preview, following, isOwner, stickyTop = 0 }: ViewProps) {
  const { store: s } = content; const a = template.archetype; const hero = template.config.hero;
  const products = content.items.filter((i) => i.kind === "product"); const services = content.items.filter((i) => i.kind === "service");
  const banner = d.hero.mediaId ? media.find((m) => m.id === d.hero.mediaId && m.kind !== "lottie") ?? null : null;
  const bannerUrl = banner?.url ?? s.cover; const poster = banner ? banner.posterUrl ?? (banner.kind === "image" ? banner.url : s.cover) : s.cover;
  const lottie = Object.fromEntries(media.filter((m) => m.kind === "lottie").map((m) => [m.id, m.url]));
  const fx = (scope: "hero" | "page", zone: "back" | "front") => (
    <EffectLayers zone={zone} assets={assets} lottie={lottie} accent={d.colors.accent}
      layers={d.effects.map((l, index) => ({ l, index })).filter(({ l }) => l.scope === scope && l.layer === zone)} />
  );
  const socials = (Object.keys(SOCIAL_HOSTS) as Social[]).map((k) => [k, socialUrl(k, s.social[k])] as const).filter(([, u]) => u);
  const has: Record<SectionId, boolean> = { products: products.length > 0, services: services.length > 0, about: true, reviews: true, contact: !isOwner, policies: !!s.policies };
  const order = d.sections.filter((x) => x.visible && has[x.id]).map((x) => x.id);
  const vars = {
    "--sf-bg": d.colors.bg, "--sf-surface": d.colors.surface, "--sf-text": d.colors.text, "--sf-muted": d.colors.muted, "--sf-accent": d.colors.accent, "--sf-accent-text": d.colors.accentText,
    "--sf-fh": FONTS[d.fonts.heading][1], "--sf-fb": FONTS[d.fonts.body][1], "--sf-scale": d.typeScale, "--sf-cols": d.products.columns, "--sf-cols-md": Math.min(3, d.products.columns), "--sf-top": `${stickyTop}px`,
  } as CSSProperties;

  const mediaEl = (
    <div className="sf-media" data-pos={d.hero.position} style={{ opacity: hero === "compact" ? undefined : d.hero.opacity / 100 }}>
      <HeroMedia kind={bannerUrl ? (banner?.kind as "image" | "gif" | "video" | undefined) ?? "image" : null} url={bannerUrl} poster={poster} still={heroStill} parallax={d.hero.parallax} alt={`${s.name} banner`} />
      <div className="sf-overlay" style={{ background: d.hero.overlayColor, opacity: d.hero.overlay / 100 }} />
      {fx("hero", "back")}{fx("hero", "front")}
    </div>
  );
  // eslint-disable-next-line @next/next/no-img-element
  const logo = s.logo ? <img className="sf-logo" src={s.logo} alt={`${s.name} logo`} /> : <span className="sf-logo none" aria-hidden>{s.name.slice(0, 1).toUpperCase()}</span>;
  const text = (
    <div className="sf-hero-text">
      <h1 className="sf-title">{s.name}</h1>
      {s.tagline && <p className="sf-tagline sf-muted">{s.tagline}</p>}
      <div className="sf-meta">
        {s.verified && <span className="sf-badge" data-verified><BadgeCheck size={13} aria-hidden />Verified student</span>}
        {s.reviewCount > 0 && <span><Star size={14} fill="#f5b400" color="#f5b400" aria-hidden />{s.rating.toFixed(1)} ({s.reviewCount})</span>}
        {s.university && <span><Store size={14} aria-hidden />{s.university}</span>}
        {s.location && <span><MapPin size={14} aria-hidden />{s.location}</span>}
        {s.isSample && <span className="sf-badge">Sample storefront</span>}
      </div>
      <div className="sf-actions">
        {!isOwner && <Follow storefrontId={s.id} initial={!!following} />}
        {!isOwner && <a className="sf-btn" href="#sf-contact"><MessageCircle size={15} aria-hidden />Contact seller</a>}
        <ShareStore />
      </div>
    </div>
  );
  const heroEl = hero === "banner" ? <>{mediaEl}<div className="sf-wrap"><div className="sf-hero-body">{logo}{text}</div></div></>
    : hero === "fullbleed" ? <>{mediaEl}<div className="sf-hero-body"><div className="sf-wrap">{logo}{text}</div></div></>
    : hero === "split" ? <div className="sf-wrap"><div className="sf-hero-grid"><div>{logo}{text}</div>{mediaEl}</div></div>
    : hero === "arch" ? <div className="sf-wrap"><div className="sf-hero-grid">{mediaEl}<div>{logo}{text}</div></div></div>
    : hero === "frame" ? <div className="sf-wrap"><div className="sf-hero-grid"><div className="sf-panel">{mediaEl}<div className="sf-hero-body">{logo}{text}</div></div></div></div>
    : <>{mediaEl}<div className="sf-wrap"><div className="sf-hero-body">{logo}{text}</div></div></>;

  const head = (id: SectionId, title: string, kicker?: string) => (
    <div className="sf-sec-head"><h2 className="sf-h2">{title}</h2>{kicker && <span className="sf-kicker">{kicker}</span>}</div>
  );
  const section: Record<SectionId, () => ReactNode> = {
    products: () => <>{head("products", "Products", `${products.length} ${products.length === 1 ? "item" : "items"}`)}<Products items={products} d={d} a={a} sid={s.id} /></>,
    services: () => <>{head("services", "Services", `${services.length} on offer`)}{a === "menu" ? <div className="sf-rows">{services.map((i) => <Row key={i.id} i={i} d={d} sid={s.id} />)}</div> : <Services items={services} sid={s.id} />}</>,
    about: () => (
      <>
        {head("about", `About ${s.name}`)}
        <div className="sf-two">
          <div>
            {s.description ? <p className="sf-prose">{s.description}</p> : <p className="sf-muted">This seller hasn't written a description yet.</p>}
            {socials.length > 0 && <div className="sf-social">{socials.map(([k, u]) => <a key={k} className="sf-btn sm ghost" href={u!} target="_blank" rel="noopener noreferrer nofollow">{SOCIAL_ICON[k]}{SOCIAL_LABEL[k]}</a>)}</div>}
          </div>
          <div className="sf-box">
            <p className="sf-kicker" style={{ marginBottom: 10 }}>Pickup points</p>
            {content.pickups.length === 0 ? <p className="sf-muted" style={{ fontSize: 14 }}>Pickup is arranged at checkout from the campus pickup points.</p> : (
              <ul className="sf-list">{content.pickups.map((p) => (
                <li key={p.id}><MapPin size={15} aria-hidden /><span><b>{p.name}</b>{(p.available_days || p.time_window) && <span className="sf-muted"> · {[p.available_days, p.time_window].filter(Boolean).join(", ")}</span>}{p.instructions && <span className="sf-muted" style={{ display: "block" }}>{p.instructions}</span>}</span></li>
              ))}</ul>
            )}
          </div>
        </div>
      </>
    ),
    reviews: () => (
      <>
        {head("reviews", "Reviews", s.reviewCount ? `${s.rating.toFixed(1)} from ${s.reviewCount}` : undefined)}
        {content.reviews.length === 0 ? <p className="sf-muted">No reviews yet. Reviews come from buyers after a completed order.</p> : (
          <div className="sf-reviews">{content.reviews.map((r) => (
            <div key={r.id} className="sf-box">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}><Stars n={r.rating} /><span className="sf-badge"><BadgeCheck size={12} aria-hidden />Verified purchase</span></div>
              {r.body && <p style={{ marginTop: 8, fontSize: 14.5 }}>{r.body}</p>}
              <p className="sf-muted" style={{ marginTop: 6, fontSize: 13 }}>{r.author ?? "A buyer"}</p>
            </div>
          ))}</div>
        )}
      </>
    ),
    contact: () => (
      <>
        {head("contact", "Contact")}
        <div className="sf-two">
          <div className="sf-box">
            <Form action={sendEnquiry} className="space-y-2">
              <input type="hidden" name="storefront_id" value={s.id} /><input type="hidden" name="back" value={`/store/${s.slug}`} />
              <Field label={`Message ${s.name}`} name="body" as="textarea" rows={3} />
              <Submit variant="dark">Send message</Submit>
            </Form>
          </div>
          <ul className="sf-list">
            {s.whatsapp && socialUrl("whatsapp", `wa.me/${s.whatsapp.replace(/\D/g, "")}`) && <li><MessageCircle size={15} aria-hidden /><a href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer nofollow">Chat on WhatsApp</a></li>}
            {s.phone && <li><Phone size={15} aria-hidden /><a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a></li>}
            {s.email && <li><Mail size={15} aria-hidden /><a href={`mailto:${s.email}`}>{s.email}</a></li>}
            {s.location && <li><MapPin size={15} aria-hidden /><span>{s.location}</span></li>}
            {socials.filter(([k]) => k !== "whatsapp").map(([k, u]) => <li key={k}>{SOCIAL_ICON[k] ?? <Store size={15} aria-hidden />}<a href={u!} target="_blank" rel="noopener noreferrer nofollow">{SOCIAL_LABEL[k]}</a></li>)}
          </ul>
        </div>
      </>
    ),
    policies: () => <>{head("policies", "Store policies")}<div className="sf-box"><p className="sf-prose">{s.policies}</p></div></>,
  };

  return (
    <div className={`sf sf-a-${a} sf-h-${hero} sf-c-${template.config.card} sf-b-${d.button}`} style={vars} data-template={d.template} inert={preview || undefined}>
      {!preview && !isOwner && <TrackVisit storefrontId={s.id} />}
      {fx("page", "back")}
      {s.announcement && <p className="sf-announce">{s.announcement}</p>}
      <header className="sf-hero" id="sf-home" data-h={d.hero.height}>{heroEl}</header>
      {a === "streetwear" && (
        <div className="sf-ticker" aria-hidden><div>{Array.from({ length: 8 }, (_, i) => <span key={i}>{i % 2 ? s.tagline || "New drops" : s.name} ✦</span>)}</div></div>
      )}
      {a === "hud" && (
        <div className="sf-wrap"><div className="sf-stats">
          <div><b>{content.items.length}</b><span>Listings</span></div><div><b>{s.reviewCount ? s.rating.toFixed(1) : "n/a"}</b><span>Rating</span></div>
          <div><b>{s.reviewCount}</b><span>Reviews</span></div><div><b>{content.pickups.length || "Campus"}</b><span>Pickup points</span></div>
        </div></div>
      )}
      <nav className="sf-nav" aria-label={`${s.name} sections`} style={{ top: "var(--sf-top)" }}>
        <div className="sf-wrap"><ul><li><a href="#sf-home">Home</a></li>{order.map((id) => <li key={id}><a href={`#sf-${id}`}>{SECTION_LABEL[id]}</a></li>)}</ul></div>
      </nav>
      <div className="sf-wrap sf-main">
        {a === "portfolio" && s.description && <p className="sf-intro">{s.description.split(/(?<=[.!?])\s/)[0]}</p>}
        {content.campaign && <div className="sf-campaign"><b style={{ fontFamily: "var(--sf-fh)", fontSize: 18 }}>{content.campaign.title}: {content.campaign.percent_off}% off everything</b>{content.campaign.body && <p className="sf-muted" style={{ fontSize: 14 }}>{content.campaign.body}</p>}</div>}
        {content.items.length === 0 && <div className="sf-empty"><b>Nothing listed yet</b><p>Check back soon or send the seller a message.</p></div>}
        {order.map((id) => <section key={id} id={`sf-${id}`} className="sf-sec" data-section={id}>{section[id]()}</section>)}
      </div>
      {fx("page", "front")}
    </div>
  );
}
