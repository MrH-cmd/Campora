// Every plan decision for the storefront builder lives here. The gallery, the editor actions,
// publishing and the public renderer all call these functions, so they can never disagree.
import { DEFAULT_TEMPLATE, type Design, type EffectDef, type Template } from "./storefront-catalog";

export type Access = { level: number; analyticsLevel: number; code: string; name: string };
export type MediaItem = { id: string; kind: "image" | "gif" | "video" | "lottie"; url: string; posterUrl: string | null; status: string; bytes?: number; duration_ms?: number | null; created_at?: string };
export type Catalog = { templates: Template[]; assets: EffectDef[]; ranks: Record<string, number>; planNames: Record<string, string> };
export type Violation = { code: string; message: string; need?: string };

const clamp = (level: number) => Math.max(0, Math.min(2, level));
/** What each customisation level unlocks. Level 0 is K-Leg, 1 is No Dulling, 2 is Odogwu. */
export const limits = (level: number) => {
  const l = clamp(level);
  return { layers: [2, 4, 6][l], animatedBanner: l >= 1, typeControls: l >= 1, lottie: l >= 2, parallax: l >= 2 };
};
export const analyticsDays = (analyticsLevel: number) => [7, 30, 90][clamp(analyticsLevel)];
export const MOBILE_LAYER_CAP = 3;

export const rankOf = (c: Catalog, planCode: string) => c.ranks[planCode] ?? 99;
export const allowed = (c: Catalog, a: Access, minPlanCode: string) => rankOf(c, minPlanCode) <= a.level;
export const planName = (c: Catalog, code: string) => c.planNames[code] ?? code;
export const canUseTemplate = (c: Catalog, a: Access, t: Template) => t.is_active !== false && allowed(c, a, t.min_plan_code);
export const canUseEffect = (c: Catalog, a: Access, e: EffectDef) => e.is_active !== false && allowed(c, a, e.min_plan_code);
export const canUseMedia = (a: Access, kind: MediaItem["kind"]) =>
  kind === "image" ? true : kind === "lottie" ? limits(a.level).lottie : limits(a.level).animatedBanner;
/** The lowest plan whose level reaches `level`. */
export const planForLevel = (c: Catalog, level: number) =>
  Object.entries(c.ranks).filter(([, r]) => r >= level).sort((x, y) => x[1] - y[1])[0]?.[0] ?? "odogwu";

/** Everything in a design that the plan doesn't cover. An empty list means it may be published. */
export function violations(d: Design, a: Access, c: Catalog, media: Map<string, MediaItem>): Violation[] {
  const out: Violation[] = [];
  const lim = limits(a.level);
  const t = c.templates.find((x) => x.slug === d.template);
  if (!t || t.is_active === false) out.push({ code: "template", message: "This template is no longer available. Pick another one." });
  else if (!allowed(c, a, t.min_plan_code))
    out.push({ code: "template", need: t.min_plan_code, message: `The ${t.name} template needs the ${planName(c, t.min_plan_code)} plan.` });
  if (d.hero.mediaId) {
    const m = media.get(d.hero.mediaId);
    if (!m || m.status !== "active" || m.kind === "lottie") out.push({ code: "banner", message: "The chosen banner is missing. Pick another one." });
    else {
      if (!canUseMedia(a, m.kind)) out.push({ code: "banner", need: planForLevel(c, 1), message: `GIF and video banners need the ${planName(c, planForLevel(c, 1))} plan.` });
      if (m.kind === "video" && !m.posterUrl) out.push({ code: "banner", message: "Add a poster image to your video banner first." });
    }
  }
  if (d.hero.parallax && !lim.parallax) out.push({ code: "parallax", need: planForLevel(c, 2), message: `Parallax banners need the ${planName(c, planForLevel(c, 2))} plan.` });
  if (!lim.typeControls && (d.typeScale !== 1 || (t && d.button !== t.config.button)))
    out.push({ code: "type", need: planForLevel(c, 1), message: `Custom font sizes and button styles need the ${planName(c, planForLevel(c, 1))} plan.` });
  if (d.effects.length > lim.layers)
    out.push({ code: "layers", need: planForLevel(c, a.level + 1), message: `Your plan allows ${lim.layers} effect layers. This design has ${d.effects.length}.` });
  for (const e of d.effects) {
    const def = c.assets.find((x) => x.slug === e.asset);
    if (!def || def.is_active === false) { out.push({ code: `effect:${e.id}`, message: "One of the effects is no longer available. Remove it." }); continue; }
    if (!allowed(c, a, def.min_plan_code)) out.push({ code: `effect:${e.id}`, need: def.min_plan_code, message: `${def.name} needs the ${planName(c, def.min_plan_code)} plan.` });
    if (def.renderer === "lottie" && !def.asset_path) {
      const m = e.mediaId ? media.get(e.mediaId) : null;
      if (!m || m.kind !== "lottie" || m.status !== "active") out.push({ code: `effect:${e.id}`, message: "Choose one of your uploaded Lottie files for this layer." });
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
  const lim = limits(a.level);
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
  if (d.hero.mediaId && (!m || m.status !== "active" || m.kind === "lottie")) d = { ...d, hero: { ...d.hero, mediaId: null } };
  else if (m && !canUseMedia(a, m.kind)) { heroStill = true; fallbacks.push("banner"); }
  if (d.hero.parallax && !lim.parallax) { d = { ...d, hero: { ...d.hero, parallax: false } }; fallbacks.push("parallax"); }
  if (!lim.typeControls && (d.typeScale !== 1 || d.button !== template.config.button)) {
    d = { ...d, typeScale: 1, button: template.config.button }; fallbacks.push("type");
  }
  const usable = d.effects.filter((e) => {
    const def = c.assets.find((x) => x.slug === e.asset);
    if (!def || !canUseEffect(c, a, def)) return false;
    if (def.renderer === "lottie" && !def.asset_path) { const lm = e.mediaId ? media.get(e.mediaId) : null; return !!lm && lm.kind === "lottie" && lm.status === "active"; }
    return true;
  });
  const effects = usable.slice(0, lim.layers);
  if (effects.length !== d.effects.length) { fallbacks.push("effects"); d = { ...d, effects }; }
  return { design: d, template, heroStill, fallbacks };
}
