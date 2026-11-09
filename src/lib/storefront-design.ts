import { z } from "zod";
import { ANCHORS, BUTTONS, FONT_IDS, SECTION_IDS, type Design } from "./storefront-catalog";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours must be six-digit hex values");
const font = z.enum(FONT_IDS as [string, ...string[]]);
const uuid = z.string().uuid();
const num = (min: number, max: number) => z.number().min(min).max(max);

/** Hard ceiling on effect layers. Each plan's own limit is applied by storefront-access. */
export const MAX_LAYERS = 6;

const effect = z.strictObject({
  id: z.string().regex(/^[a-z0-9]{1,12}$/), asset: z.string().regex(/^[a-z0-9-]{1,60}$/), mediaId: uuid.nullish(),
  scope: z.enum(["hero", "page"]), anchor: z.enum(ANCHORS), x: num(-50, 50), y: num(-50, 50), size: num(10, 100),
  opacity: num(.05, 1), speed: num(.25, 3), direction: num(0, 359), density: num(.2, 2), color: hex.nullish(), layer: z.enum(["back", "front"]),
});

/** The whole design document. Strict: unknown keys, free text, HTML, CSS and scripts have nowhere to go. */
export const designSchema = z.strictObject({
  v: z.literal(1),
  template: z.string().regex(/^[a-z0-9-]{1,60}$/),
  colors: z.strictObject({ bg: hex, surface: hex, text: hex, muted: hex, accent: hex, accentText: hex }),
  fonts: z.strictObject({ heading: font, body: font }),
  typeScale: num(.85, 1.25),
  button: z.enum(BUTTONS),
  hero: z.strictObject({
    mediaId: uuid.nullable(), height: z.enum(["sm", "md", "lg"]), position: z.enum(["top", "center", "bottom"]),
    overlay: num(0, 90), overlayColor: hex, opacity: num(20, 100), parallax: z.boolean(),
  }),
  products: z.strictObject({ columns: z.union([z.literal(2), z.literal(3), z.literal(4)]), showStock: z.boolean(), showRating: z.boolean() }),
  sections: z.array(z.strictObject({ id: z.enum(SECTION_IDS), visible: z.boolean() })).length(SECTION_IDS.length)
    .refine((s) => new Set(s.map((x) => x.id)).size === SECTION_IDS.length, "Each section must appear once"),
  effects: z.array(effect).max(MAX_LAYERS, `A store can have at most ${MAX_LAYERS} effect layers`)
    .refine((e) => new Set(e.map((x) => x.id)).size === e.length, "Effect layers need unique ids"),
});

export function parseDesign(input: unknown): Design {
  const r = designSchema.safeParse(typeof input === "string" ? safeJson(input) : input);
  if (!r.success) throw new DesignError(r.error.issues[0]?.message ?? "That design isn't valid.");
  return r.data as Design;
}
export class DesignError extends Error {}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

export const SOCIAL_HOSTS = { instagram: "instagram.com", tiktok: "tiktok.com", x: "x.com", facebook: "facebook.com", youtube: "youtube.com", whatsapp: "wa.me" } as const;
export type Social = keyof typeof SOCIAL_HOSTS;

/** Returns a clean https link on the expected site, or null. */
export function socialUrl(kind: Social, raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.protocol !== "https:" || u.username || u.password || u.port || host !== SOCIAL_HOSTS[kind] || v.length > 200) return null;
  return `https://${host}${u.pathname}${u.search}`;
}
