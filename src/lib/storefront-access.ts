// Every plan decision for the storefront builder lives here. The gallery, the editor actions,
// publishing and the public renderer all call these functions, so they can never disagree.
import { DEFAULT_TEMPLATE, type Design, type EffectDef, type Template } from "./storefront-catalog";

export const FEATURE_KEYS = [
  "gif_banner", "video_banner", "parallax", "hero_style", "card_style", "layout_list", "layout_showcase", "section_tone", "section_width",
  "nav_style", "nav_labels", "type_controls", "type_premium", "bg_more", "bg_premium", "transition_rise", "transition_cinema",
  "effect_controls", "effect_position", "effect_layering", "intensity", "lottie", "rive", "analytics_engagement", "analytics_insights",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type PlanFeature = { key: string; label: string; description: string; grp: string; min_plan_code: string; sort: number };
export type Access = {
  level: number; analyticsLevel: number; code: string; name: string;
  /** Plan numbers, editable by admins. */ layers: number; storefronts: number;
  /** Which storefront features this plan unlocks, from the plan_features table. */ features: Record<FeatureKey, boolean>;
};
export type MediaItem = { id: string; kind: "image" | "gif" | "video" | "lottie" | "rive"; url: string; posterUrl: string | null; status: string; bytes?: number; duration_ms?: number | null; created_at?: string };
export type Catalog = { templates: Template[]; assets: EffectDef[]; ranks: Record<string, number>; planNames: Record<string, string>; features: PlanFeature[] };
export type Violation = { code: string; message: string; need?: string };

const clamp = (level: number) => Math.max(0, Math.min(2, level));
/** K-Leg GIFs are capped smaller; paid plans get the full GIF limit. */
export const SMALL_GIF_BYTES = 2 * 1024 * 1024;
/** Feature flags for a plan rank. Unknown keys fall back to Odogwu-only, so a missing row never unlocks anything. */
export function featuresFor(c: Pick<Catalog, "features" | "ranks">, level: number): Record<FeatureKey, boolean> {
  const byKey = Object.fromEntries(c.features.map((f) => [f.key, f.min_plan_code]));
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, (c.ranks[byKey[k] ?? "odogwu"] ?? 99) <= level])) as Record<FeatureKey, boolean>;
}
export const featurePlan = (c: Catalog, key: FeatureKey) => c.features.find((f) => f.key === key)?.min_plan_code ?? "odogwu";
export const featureLabel = (c: Catalog, key: FeatureKey) => c.features.find((f) => f.key === key)?.label ?? key;
const needs = (c: Catalog, key: FeatureKey) => `${featureLabel(c, key)} needs the ${planName(c, featurePlan(c, key))} plan.`;

/** The simple yes/no switches the editor and media pages show. */
export const limits = (a: Access) => ({
  layers: a.layers, animatedBanner: a.features.gif_banner || a.features.video_banner, gif: a.features.gif_banner, video: a.features.video_banner,
  gifBytes: a.features.video_banner ? 8 * 1024 * 1024 : SMALL_GIF_BYTES,
  typeControls: a.features.type_controls, lottie: a.features.lottie, rive: a.features.rive, parallax: a.features.parallax,
});
export const analyticsDays = (analyticsLevel: number) => [7, 30, 90][clamp(analyticsLevel)];
export const MOBILE_LAYER_CAP = 3;

export const rankOf = (c: Catalog, planCode: string) => c.ranks[planCode] ?? 99;
export const allowed = (c: Catalog, a: Access, minPlanCode: string) => rankOf(c, minPlanCode) <= a.level;
export const planName = (c: Catalog, code: string) => c.planNames[code] ?? code;
export const canUseTemplate = (c: Catalog, a: Access, t: Template) => t.is_active !== false && allowed(c, a, t.min_plan_code);
export const canUseEffect = (c: Catalog, a: Access, e: EffectDef) => e.is_active !== false && allowed(c, a, e.min_plan_code);
export const canUseMedia = (a: Access, kind: MediaItem["kind"], bytes?: number) =>
  kind === "image" ? true : kind === "lottie" ? a.features.lottie : kind === "rive" ? a.features.rive
  : kind === "video" ? a.features.video_banner : a.features.gif_banner && (bytes == null || bytes <= limits(a).gifBytes);
/** The lowest plan whose level reaches `level`. */
export const planForLevel = (c: Catalog, level: number) =>
  Object.entries(c.ranks).filter(([, r]) => r >= level).sort((x, y) => x[1] - y[1])[0]?.[0] ?? "odogwu";

type Rule = { key: FeatureKey; uses: (d: Design, t: Template) => boolean; strip: (d: Design, t: Template) => Design };
/** The template's own starting values for an effect, so template defaults never count as premium edits. */
const base = (t: Template, asset: string) => { const e = t.config.effects.find((x) => x.asset === asset) ?? {}; return { speed: 1, direction: 0, density: 1, x: 0, y: 0, layer: "back", scope: "hero", ...e }; };
const st = (d: Design, patch: Partial<Design["style"]>): Design => ({ ...d, style: { ...d.style, ...patch } });
const fx = (d: Design, t: Template, test: (e: Design["effects"][number], b: ReturnType<typeof base>) => boolean, fix: (b: ReturnType<typeof base>) => Partial<Design["effects"][number]>): Rule["strip"] =>
  () => ({ ...d, effects: d.effects.map((e) => { const b = base(t, e.asset); return test(e, b) ? { ...e, ...fix(b) } : e; }) });
const RULES: Rule[] = [
  { key: "parallax", uses: (d) => d.hero.parallax, strip: (d) => ({ ...d, hero: { ...d.hero, parallax: false } }) },
  { key: "type_controls", uses: (d, t) => d.typeScale !== 1 || d.button !== t.config.button, strip: (d, t) => ({ ...d, typeScale: 1, button: t.config.button }) },
  { key: "type_premium", uses: (d) => d.style.headingCase !== "normal" || d.style.tracking !== 0, strip: (d) => st(d, { headingCase: "normal", tracking: 0 }) },
  { key: "hero_style", uses: (d, t) => !!d.style.hero && d.style.hero !== t.config.hero, strip: (d) => st(d, { hero: null }) },
  { key: "card_style", uses: (d, t) => !!d.style.card && d.style.card !== t.config.card, strip: (d) => st(d, { card: null }) },
  { key: "layout_list", uses: (d) => d.style.productLayout === "list", strip: (d) => st(d, { productLayout: "grid" }) },
  { key: "layout_showcase", uses: (d) => d.style.productLayout === "carousel" || d.style.productLayout === "spotlight", strip: (d) => st(d, { productLayout: "grid" }) },
  { key: "section_tone", uses: (d) => d.sections.some((x) => x.tone !== "plain"), strip: (d) => ({ ...d, sections: d.sections.map((x) => ({ ...x, tone: "plain" })) }) },
  { key: "section_width", uses: (d) => d.sections.some((x) => x.width !== "normal"), strip: (d) => ({ ...d, sections: d.sections.map((x) => ({ ...x, width: "normal" })) }) },
  { key: "nav_style", uses: (d) => d.style.nav !== "bar", strip: (d) => st(d, { nav: "bar" }) },
  { key: "nav_labels", uses: (d) => Object.values(d.style.navLabels).some((v) => !!v?.trim()), strip: (d) => st(d, { navLabels: {} }) },
  { key: "bg_more", uses: (d) => ["dots", "grid", "grain"].includes(d.style.background), strip: (d) => st(d, { background: "none" }) },
  { key: "bg_premium", uses: (d) => ["mesh", "spotlight"].includes(d.style.background), strip: (d) => st(d, { background: "none" }) },
  { key: "transition_rise", uses: (d) => d.style.transition === "rise", strip: (d) => st(d, { transition: "fade" }) },
  { key: "transition_cinema", uses: (d) => d.style.transition === "cinema", strip: (d) => st(d, { transition: "fade" }) },
  { key: "intensity", uses: (d) => d.style.intensity !== 1, strip: (d) => st(d, { intensity: 1 }) },
  { key: "effect_controls", uses: (d, t) => d.effects.some((e) => { const b = base(t, e.asset); return e.speed !== b.speed || e.direction !== b.direction || e.density !== b.density; }),
    strip: (d, t) => fx(d, t, () => true, (b) => ({ speed: b.speed, direction: b.direction, density: b.density }))(d, t) },
  { key: "effect_position", uses: (d, t) => d.effects.some((e) => { const b = base(t, e.asset); return e.x !== b.x || e.y !== b.y; }),
    strip: (d, t) => fx(d, t, () => true, (b) => ({ x: b.x, y: b.y }))(d, t) },
  { key: "effect_layering", uses: (d, t) => d.effects.some((e) => { const b = base(t, e.asset); return e.layer !== b.layer || e.scope !== b.scope; }),
    strip: (d, t) => fx(d, t, () => true, (b) => ({ layer: b.layer as "back" | "front", scope: b.scope as "hero" | "page" }))(d, t) },
];

/** Everything in a design that the plan doesn't cover. An empty list means it may be published. */
export function violations(d: Design, a: Access, c: Catalog, media: Map<string, MediaItem>): Violation[] {
  const out: Violation[] = [];
  const t = c.templates.find((x) => x.slug === d.template);
  if (!t || t.is_active === false) out.push({ code: "template", message: "This template is no longer available. Pick another one." });
  else if (!allowed(c, a, t.min_plan_code))
    out.push({ code: "template", need: t.min_plan_code, message: `The ${t.name} template needs the ${planName(c, t.min_plan_code)} plan.` });
  if (d.hero.mediaId) {
    const m = media.get(d.hero.mediaId);
    if (!m || m.status !== "active" || m.kind === "lottie" || m.kind === "rive") out.push({ code: "banner", message: "The chosen banner is missing. Pick another one." });
    else {
      if (!canUseMedia(a, m.kind, m.bytes)) {
        const key: FeatureKey = m.kind === "video" || (m.kind === "gif" && a.features.gif_banner) ? "video_banner" : "gif_banner";
        out.push({ code: "banner", need: featurePlan(c, key), message: m.kind === "gif" && a.features.gif_banner
          ? `GIFs over 2 MB need the ${planName(c, featurePlan(c, "video_banner"))} plan. Upload a smaller GIF or upgrade.` : needs(c, key) });
      }
      if (m.kind === "video" && !m.posterUrl) out.push({ code: "banner", message: "Add a poster image to your video banner first." });
    }
  }
  if (t) for (const r of RULES) if (!a.features[r.key] && r.uses(d, t)) out.push({ code: r.key, need: featurePlan(c, r.key), message: needs(c, r.key) });
  if (d.effects.length > a.layers)
    out.push({ code: "layers", need: planForLevel(c, a.level + 1), message: `Your plan allows ${a.layers} effect layers. This design has ${d.effects.length}.` });
  for (const e of d.effects) {
    const def = c.assets.find((x) => x.slug === e.asset);
    if (!def || def.is_active === false) { out.push({ code: `effect:${e.id}`, message: "One of the effects is no longer available. Remove it." }); continue; }
    if (!allowed(c, a, def.min_plan_code)) out.push({ code: `effect:${e.id}`, need: def.min_plan_code, message: `${def.name} needs the ${planName(c, def.min_plan_code)} plan.` });
    if ((def.renderer === "lottie" || def.renderer === "rive") && !def.asset_path) {
      const m = e.mediaId ? media.get(e.mediaId) : null;
      if (!m || m.kind !== def.renderer || m.status !== "active") out.push({ code: `effect:${e.id}`, message: `Choose one of your uploaded ${def.renderer === "rive" ? "Rive" : "Lottie"} files for this layer.` });
    }
  }
  return out;
}

export type Resolved = { design: Design; template: Template; heroStill: boolean; fallbacks: string[] };

/**
 * Turns a saved design into one that is safe to show on the current plan. Nothing is deleted from
 * the saved design: locked parts are simply left out of what gets rendered, so an upgrade restores them.
 */
export function resolveDesign(saved: Design, a: Access, c: Catalog, media: Map<string, MediaItem>): Resolved {
  const fallbacks: string[] = [];
  const wanted = c.templates.find((x) => x.slug === saved.template);
  let template = wanted && canUseTemplate(c, a, wanted) ? wanted : undefined;
  let d: Design = saved;
  if (!template) {
    const open = c.templates.filter((t) => canUseTemplate(c, a, t)).sort((x, y) => rankOf(c, x.min_plan_code) - rankOf(c, y.min_plan_code) || x.sort - y.sort);
    template = open.find((t) => wanted && t.archetype === wanted.archetype) ?? open.find((t) => t.slug === DEFAULT_TEMPLATE) ?? open[0] ?? wanted ?? c.templates[0];
    fallbacks.push(`template:${saved.template}`);
    d = { ...d, template: template.slug, fonts: { ...template.config.fonts }, button: template.config.button };
  }
  let heroStill = false;
  const m = d.hero.mediaId ? media.get(d.hero.mediaId) : null;
  if (d.hero.mediaId && (!m || m.status !== "active" || m.kind === "lottie" || m.kind === "rive")) d = { ...d, hero: { ...d.hero, mediaId: null } };
  else if (m && !canUseMedia(a, m.kind, m.bytes)) { heroStill = true; fallbacks.push("banner"); }
  for (const r of RULES) if (!a.features[r.key] && r.uses(d, template)) { d = r.strip(d, template); fallbacks.push(r.key); }
  const usable = d.effects.filter((e) => {
    const def = c.assets.find((x) => x.slug === e.asset);
    if (!def || !canUseEffect(c, a, def)) return false;
    if ((def.renderer === "lottie" || def.renderer === "rive") && !def.asset_path) { const lm = e.mediaId ? media.get(e.mediaId) : null; return !!lm && lm.kind === def.renderer && lm.status === "active"; }
    return true;
  });
  const effects = usable.slice(0, a.layers);
  if (effects.length !== d.effects.length) { fallbacks.push("effects"); d = { ...d, effects }; }
  return { design: d, template, heroStill, fallbacks };
}
