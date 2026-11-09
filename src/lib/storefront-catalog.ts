// The storefront design vocabulary: layouts, hero and card styles, fonts, palettes, and the seeded
// templates and effects. Plain data with no imports, so the seed script, server and browser can all use it.

export const ARCHETYPES = ["catalogue", "magazine", "streetwear", "luxury", "menu", "portfolio", "hud", "beauty", "spec", "scrapbook"] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  catalogue: "Minimal catalogue", magazine: "Editorial magazine", streetwear: "Streetwear grid", luxury: "Split-screen luxury", menu: "Food menu",
  portfolio: "Service portfolio", hud: "Gaming HUD", beauty: "Soft beauty", spec: "Tech spec sheet", scrapbook: "Handmade scrapbook",
};
export const HEROES = ["banner", "fullbleed", "split", "arch", "frame", "compact"] as const;
export type HeroStyle = (typeof HEROES)[number];
export const HERO_LABEL: Record<HeroStyle, string> = { banner: "Banner with logo", fullbleed: "Full-bleed", split: "Split screen", arch: "Arched image", frame: "Framed panel", compact: "Compact strip" };
export const CARDS = ["tag", "bordered", "minimal", "polaroid", "clip", "round"] as const;
export type CardStyle = (typeof CARDS)[number];
export const BUTTONS = ["rounded", "pill", "square", "outline"] as const;
export type ButtonStyle = (typeof BUTTONS)[number];

export const FONTS = {
  bricolage: ["Bricolage Grotesque", '"Bricolage Grotesque Variable", system-ui, sans-serif'],
  instrument: ["Instrument Sans", '"Instrument Sans Variable", system-ui, sans-serif'],
  space: ["Space Grotesk", '"Space Grotesk Variable", system-ui, sans-serif'],
  outfit: ["Outfit", '"Outfit Variable", system-ui, sans-serif'],
  syne: ["Syne", '"Syne Variable", system-ui, sans-serif'],
  playfair: ["Playfair Display", '"Playfair Display Variable", Georgia, serif'],
  fraunces: ["Fraunces", '"Fraunces Variable", Georgia, serif'],
  dmserif: ["DM Serif Display", '"DM Serif Display", Georgia, serif'],
  anton: ["Anton", '"Anton", Impact, sans-serif'],
  mono: ["JetBrains Mono", '"JetBrains Mono Variable", ui-monospace, monospace'],
  orbitron: ["Orbitron", '"Orbitron Variable", system-ui, sans-serif'],
  caveat: ["Caveat", '"Caveat Variable", cursive'],
} as const;
export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as FontId[];

export type Colors = { bg: string; surface: string; text: string; muted: string; accent: string; accentText: string };
const pal = (bg: string, surface: string, text: string, muted: string, accent: string, accentText: string): Colors => ({ bg, surface, text, muted, accent, accentText });
export const PALETTES: Record<string, Colors> = {
  midnight: pal("#070509", "#131019", "#f4f0ff", "#9a91b3", "#7c3aed", "#ffffff"),
  paper: pal("#faf8f4", "#ffffff", "#1a1814", "#6b655c", "#1a1814", "#ffffff"),
  cream: pal("#fff7ea", "#ffffff", "#2b2118", "#7a6a58", "#c2410c", "#ffffff"),
  ink: pal("#0b0d12", "#151922", "#eef1f6", "#8b93a3", "#38bdf8", "#04111a"),
  slate: pal("#0f172a", "#1e293b", "#f1f5f9", "#94a3b8", "#22d3ee", "#06202a"),
  wine: pal("#1c0a12", "#2a111c", "#fbe9ef", "#c493a5", "#e11d48", "#ffffff"),
  sand: pal("#f3ead9", "#fbf6ec", "#2a2118", "#75675a", "#9a5b2e", "#ffffff"),
  volt: pal("#0a0a0a", "#161616", "#fafafa", "#9a9a9a", "#d4ff3a", "#0a0a0a"),
  blaze: pal("#120806", "#1f100c", "#fff1ea", "#c79a8a", "#ff5a1f", "#140500"),
  concrete: pal("#e9e9e6", "#f6f6f4", "#111111", "#62625e", "#111111", "#ffffff"),
  noirgold: pal("#0c0a07", "#17130c", "#f6efdf", "#a39779", "#d4af37", "#141005"),
  ivory: pal("#f8f5ee", "#ffffff", "#1c1a16", "#7c766a", "#8a6d3b", "#ffffff"),
  noir: pal("#050505", "#101010", "#f5f5f5", "#8a8a8a", "#ffffff", "#000000"),
  chili: pal("#fff4e6", "#ffffff", "#2a1608", "#8a6a52", "#d9480f", "#ffffff"),
  leaf: pal("#f1f7ee", "#ffffff", "#16261a", "#5d7362", "#2f7d3b", "#ffffff"),
  neon: pal("#05010d", "#110822", "#f3eaff", "#a78bcf", "#ff2bd6", "#12000f"),
  cyber: pal("#020b0f", "#071a21", "#dffcff", "#6fa9b3", "#00f0ff", "#001417"),
  blush: pal("#fff1f3", "#ffffff", "#3b1d26", "#94707b", "#e8588a", "#ffffff"),
  lilac: pal("#f6f1ff", "#ffffff", "#27193f", "#7c6d99", "#8b5cf6", "#ffffff"),
  kraft: pal("#e8dcc6", "#f5ecda", "#33261a", "#7b6851", "#b4532a", "#ffffff"),
  sky: pal("#eef6ff", "#ffffff", "#10243b", "#5f7892", "#2563eb", "#ffffff"),
  arcade: pal("#0d0221", "#190b3a", "#fff7d6", "#b3a3e0", "#ffd400", "#1a1200"),
};

export const SECTION_IDS = ["products", "services", "about", "reviews", "contact", "policies"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABEL: Record<SectionId, string> = { products: "Products", services: "Services", about: "About", reviews: "Reviews", contact: "Contact", policies: "Policies" };
export const ANCHORS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type Anchor = (typeof ANCHORS)[number];

export type EffectLayer = {
  id: string; asset: string; mediaId?: string | null; scope: "hero" | "page"; anchor: Anchor; x: number; y: number;
  size: number; opacity: number; speed: number; direction: number; density: number; color?: string | null; layer: "back" | "front";
};
export type Design = {
  v: 1; template: string; colors: Colors; fonts: { heading: FontId; body: FontId }; typeScale: number; button: ButtonStyle;
  hero: { mediaId: string | null; height: "sm" | "md" | "lg"; position: "top" | "center" | "bottom"; overlay: number; overlayColor: string; opacity: number; parallax: boolean };
  products: { columns: 2 | 3 | 4; showStock: boolean; showRating: boolean };
  sections: { id: SectionId; visible: boolean }[];
  effects: EffectLayer[];
};
export type TemplateConfig = { hero: HeroStyle; card: CardStyle; fonts: { heading: FontId; body: FontId }; colors: Colors; button: ButtonStyle; columns: 2 | 3 | 4; effects: Partial<EffectLayer>[] };
export type Template = {
  slug: string; name: string; description: string; category: string; industry_tags: string[]; style_tags: string[];
  archetype: Archetype; config: TemplateConfig; min_plan_code: string; sort: number;
  id?: string; preview_path?: string | null; mobile_preview_path?: string | null; is_active?: boolean;
};

export const layer = (asset: string, p: Partial<EffectLayer> = {}): EffectLayer => ({
  id: Math.random().toString(36).slice(2, 8), asset, scope: "hero", anchor: "center", x: 0, y: 0, size: 100, opacity: .6, speed: 1, direction: 0, density: 1, color: null, layer: "back", ...p,
});

/** The starting design for a template. Hero media, section order and product display carry over from `keep`. */
export function designFromTemplate(t: Pick<Template, "slug" | "config">, keep?: Design | null): Design {
  return {
    v: 1, template: t.slug, colors: { ...t.config.colors }, fonts: { ...t.config.fonts }, typeScale: 1, button: t.config.button,
    hero: keep?.hero ?? { mediaId: null, height: "md", position: "center", overlay: 35, overlayColor: "#000000", opacity: 100, parallax: false },
    products: keep?.products ?? { columns: t.config.columns, showStock: true, showRating: true },
    sections: keep?.sections ?? SECTION_IDS.map((id) => ({ id, visible: true })),
    effects: t.config.effects.map((e) => layer(e.asset!, e)),
  };
}

type Row = [slug: string, name: string, hero: HeroStyle, card: CardStyle, heading: FontId, body: FontId, palette: string, button: ButtonStyle, effects: Partial<EffectLayer>[], description: string];
const fx = (asset: string, p: Partial<EffectLayer> = {}) => ({ asset, ...p });
const GROUPS: { archetype: Archetype; category: string; industry: string[]; style: string[]; columns: 2 | 3 | 4; rows: Row[] }[] = [
  { archetype: "catalogue", category: "General", industry: ["general", "fashion", "electronics"], style: ["minimal", "clean"], columns: 4, rows: [
    ["campus-classic", "Campus Classic", "banner", "tag", "bricolage", "instrument", "midnight", "rounded", [fx("aurora", { opacity: .35 })], "The Vybe look: cover banner, logo and a tidy product grid."],
    ["clean-slate", "Clean Slate", "compact", "minimal", "outfit", "instrument", "paper", "pill", [], "A quiet white catalogue that lets the photos talk."],
    ["north-star", "North Star", "fullbleed", "bordered", "space", "outfit", "ink", "rounded", [fx("starfield", { opacity: .7 })], "A dark full-width hero with stars behind your name."],
    ["daylight", "Daylight", "split", "minimal", "syne", "instrument", "sky", "pill", [fx("floating-dots", { opacity: .4 })], "Bright and airy, with your banner beside your story."],
    ["gridline", "Gridline", "frame", "bordered", "mono", "space", "slate", "square", [fx("grid-pulse", { opacity: .4 })], "A precise, lined catalogue for sellers who like order."],
  ] },
  { archetype: "magazine", category: "Editorial", industry: ["fashion", "photography", "art"], style: ["editorial", "serif"], columns: 3, rows: [
    ["front-page", "Front Page", "fullbleed", "minimal", "playfair", "instrument", "paper", "square", [], "A magazine cover: one big headline and a lead story product."],
    ["sunday-issue", "Sunday Issue", "banner", "minimal", "dmserif", "outfit", "cream", "rounded", [fx("soft-glow", { opacity: .4 })], "Warm weekend-paper feel with numbered features."],
    ["cover-story", "Cover Story", "split", "bordered", "fraunces", "instrument", "wine", "square", [fx("petals", { opacity: .5, density: .6 })], "Deep red editorial spread with a split cover."],
    ["long-read", "Long Read", "compact", "minimal", "playfair", "outfit", "ink", "outline", [fx("rain", { opacity: .3, density: .6 })], "A dark, text-first issue for brands with a story."],
    ["gallery-issue", "Gallery Issue", "arch", "polaroid", "fraunces", "space", "sand", "pill", [], "An arched cover image and prints pinned underneath."],
  ] },
  { archetype: "streetwear", category: "Streetwear", industry: ["fashion", "sneakers"], style: ["bold", "uppercase"], columns: 3, rows: [
    ["block-party", "Block Party", "banner", "bordered", "anton", "instrument", "volt", "square", [fx("shine-sweep", { opacity: .4 })], "Loud type, hard borders and a ticker running across the top."],
    ["drop-day", "Drop Day", "fullbleed", "clip", "anton", "space", "blaze", "square", [fx("embers", { opacity: .6 })], "Built for launch day: full-bleed hero with rising embers."],
    ["concrete-jungle", "Concrete Jungle", "split", "bordered", "syne", "space", "concrete", "square", [fx("speed-lines", { opacity: .25 })], "Grey, raw and graphic, with speed lines across the hero."],
    ["tape-deck", "Tape Deck", "compact", "tag", "bricolage", "mono", "volt", "outline", [fx("scanlines", { opacity: .3 })], "A mixtape look with scanlines and price stickers."],
    ["hype-wall", "Hype Wall", "frame", "clip", "anton", "mono", "noir", "square", [fx("confetti", { opacity: .6, density: .6 })], "A wall of drops in black and white, boxed in a heavy frame."],
  ] },
  { archetype: "luxury", category: "Luxury", industry: ["fashion", "beauty", "jewellery"], style: ["elegant", "spacious"], columns: 3, rows: [
    ["maison", "Maison", "split", "minimal", "dmserif", "instrument", "noirgold", "outline", [fx("soft-glow", { opacity: .35, color: "#d4af37" })], "Black and gold, half image and half words, lots of space."],
    ["atelier", "Atelier", "fullbleed", "minimal", "playfair", "space", "ivory", "outline", [], "Ivory boutique with a tall, calm cover image."],
    ["gilded", "Gilded", "arch", "round", "fraunces", "outfit", "noirgold", "pill", [fx("fireflies", { opacity: .7, color: "#d4af37" })], "An arched portrait cover with drifting gold light."],
    ["velvet-room", "Velvet Room", "banner", "bordered", "dmserif", "space", "wine", "outline", [fx("aurora-ribbons", { opacity: .4, color: "#e11d48" })], "Wine-dark showroom with slow ribbons of light."],
    ["obsidian", "Obsidian", "compact", "minimal", "syne", "outfit", "noir", "outline", [fx("orbit-crystal", { opacity: .7, size: 45, anchor: "right" })], "Pure black with a slowly turning crystal in the header."],
  ] },
  { archetype: "menu", category: "Food", industry: ["food", "drinks", "snacks"], style: ["menu", "warm"], columns: 2, rows: [
    ["chop-list", "Chop List", "compact", "minimal", "bricolage", "outfit", "chili", "pill", [], "Your food as a real menu: name, price, add. Fast to order from."],
    ["mama-put", "Mama Put", "banner", "minimal", "caveat", "instrument", "cream", "rounded", [fx("floating-dots", { opacity: .35, color: "#c2410c" })], "A handwritten chalkboard menu with a homely banner."],
    ["street-grill", "Street Grill", "fullbleed", "minimal", "anton", "outfit", "blaze", "square", [fx("embers", { opacity: .7 })], "Suya-stand energy: dark, smoky, with sparks rising."],
    ["bakehouse", "Bakehouse", "arch", "minimal", "fraunces", "bricolage", "sand", "pill", [fx("petals", { opacity: .4, color: "#fbf6ec", density: .5 })], "Soft bakery menu with an arched window photo."],
    ["night-kitchen", "Night Kitchen", "split", "minimal", "syne", "mono", "neon", "rounded", [fx("neon-skyline", { opacity: .7 }), fx("rain", { opacity: .3 })], "Late-night menu over a rainy neon skyline."],
  ] },
  { archetype: "portfolio", category: "Services", industry: ["services", "photography", "design", "tech", "hair"], style: ["personal", "portfolio"], columns: 2, rows: [
    ["open-studio", "Open Studio", "split", "bordered", "space", "instrument", "lilac", "pill", [fx("floating-dots", { opacity: .4 })], "A personal site for what you do, with services up front."],
    ["the-freelancer", "The Freelancer", "compact", "minimal", "outfit", "space", "paper", "rounded", [], "Straight to the point: who you are, what you offer, how to book."],
    ["showreel", "Showreel", "fullbleed", "bordered", "syne", "bricolage", "ink", "pill", [fx("clouds", { opacity: .4 })], "A full-screen reel of your best work for photographers and editors."],
    ["booked-out", "Booked Out", "banner", "round", "bricolage", "space", "leaf", "pill", [fx("bubbles", { opacity: .4 })], "Fresh and friendly booking page for stylists and tutors."],
    ["signature", "Signature", "arch", "minimal", "caveat", "outfit", "ivory", "outline", [fx("sunset-sky", { opacity: .5, layer: "back" })], "Signed with your own hand, over a slow sunset."],
  ] },
  { archetype: "hud", category: "Gaming", industry: ["gaming", "electronics", "tech"], style: ["dark", "futuristic"], columns: 3, rows: [
    ["player-one", "Player One", "frame", "clip", "orbitron", "instrument", "cyber", "square", [fx("grid-pulse", { opacity: .45, color: "#00f0ff" })], "A heads-up display: bracketed panels, stat bar and clipped cards."],
    ["loadout", "Loadout", "banner", "clip", "orbitron", "mono", "arcade", "square", [fx("scanlines", { opacity: .35 }), fx("starfield", { opacity: .6 })], "Pick-your-gear screen in arcade purple and yellow."],
    ["night-city", "Night City", "fullbleed", "clip", "orbitron", "space", "neon", "square", [fx("neon-skyline", { opacity: .8 }), fx("rain", { opacity: .35 })], "Cyberpunk skyline in the rain behind your shop name."],
    ["boss-level", "Boss Level", "split", "clip", "mono", "instrument", "volt", "square", [fx("data-stream", { opacity: .4, color: "#d4ff3a" })], "Terminal green data streams and a split command screen."],
    ["arcade-cabinet", "Arcade Cabinet", "compact", "clip", "orbitron", "outfit", "arcade", "square", [fx("particle-wave", { opacity: .7 })], "A rolling 3D particle wave under a compact title bar."],
  ] },
  { archetype: "beauty", category: "Beauty", industry: ["beauty", "hair", "skincare"], style: ["soft", "rounded"], columns: 3, rows: [
    ["glow-up", "Glow Up", "arch", "round", "playfair", "bricolage", "blush", "pill", [fx("soft-glow", { opacity: .5, color: "#e8588a" })], "Soft pink salon page with round product shots."],
    ["petal", "Petal", "banner", "round", "dmserif", "bricolage", "lilac", "pill", [fx("petals", { opacity: .6, color: "#c4b5fd" })], "Lilac and gentle, with petals falling across the banner."],
    ["rose-water", "Rose Water", "split", "round", "caveat", "space", "blush", "pill", [fx("bubbles", { opacity: .5, color: "#e8588a" })], "Handwritten and bubbly for skincare and nails."],
    ["silk", "Silk", "fullbleed", "round", "outfit", "fraunces", "ivory", "pill", [fx("aurora-ribbons", { opacity: .35, color: "#d8b98a" })], "Cream silk ribbons moving behind a full-width cover."],
    ["bloom", "Bloom", "compact", "round", "syne", "fraunces", "leaf", "pill", [fx("fireflies", { opacity: .6, color: "#2f7d3b" })], "Green, natural and calm for organic products."],
  ] },
  { archetype: "spec", category: "Technology", industry: ["electronics", "tech", "gadgets"], style: ["technical", "data"], columns: 2, rows: [
    ["spec-sheet", "Spec Sheet", "compact", "bordered", "space", "mono", "slate", "square", [fx("grid-pulse", { opacity: .3 })], "Products as a comparison table: price, stock and rating in columns."],
    ["bench-test", "Bench Test", "frame", "bordered", "mono", "outfit", "paper", "square", [], "A lab report on white, for tested and refurbished gear."],
    ["circuit", "Circuit", "split", "bordered", "space", "bricolage", "cyber", "rounded", [fx("data-stream", { opacity: .35 })], "Teal-on-black with streams of data beside your banner."],
    ["unboxed", "Unboxed", "banner", "bordered", "outfit", "outfit", "sky", "rounded", [fx("clouds", { opacity: .35 })], "Light, friendly tech store with a wide product banner."],
    ["datasheet", "Datasheet", "fullbleed", "bordered", "mono", "mono", "ink", "square", [fx("lightning", { opacity: .5 })], "All monospace, all business, with a storm in the header."],
  ] },
  { archetype: "scrapbook", category: "Handmade", industry: ["handmade", "art", "crafts", "thrift"], style: ["playful", "handwritten"], columns: 3, rows: [
    ["handmade", "Handmade", "banner", "polaroid", "caveat", "bricolage", "kraft", "rounded", [], "Kraft paper, tilted polaroids and tape. Made-by-hand feel."],
    ["craft-table", "Craft Table", "arch", "polaroid", "caveat", "mono", "sand", "rounded", [fx("confetti", { opacity: .5, density: .5 })], "Typewriter notes and paper scraps on a sandy desk."],
    ["paper-trail", "Paper Trail", "compact", "polaroid", "bricolage", "bricolage", "cream", "pill", [fx("snow", { opacity: .4, color: "#c2410c", density: .4 })], "A tidy pinboard with drifting paper flecks."],
    ["market-stall", "Market Stall", "split", "polaroid", "caveat", "fraunces", "leaf", "rounded", [fx("fireflies", { opacity: .5 })], "A green weekend-market stall with your story on one side."],
    ["studio-notes", "Studio Notes", "fullbleed", "polaroid", "playfair", "mono", "kraft", "outline", [fx("sunset-sky", { opacity: .4 })], "An artist's notebook over a warm, slow sky."],
  ] },
];

const TIER = ["k-leg", "no-dulling", "odogwu", "odogwu", "odogwu"];
/** 50 templates: one per layout on K-Leg, a second on No Dulling, three more on Odogwu. */
export const TEMPLATES: Template[] = GROUPS.flatMap((g, gi) => g.rows.map(([slug, name, hero, card, heading, body, palette, button, effects, description], i) => ({
  slug, name, description, category: g.category, industry_tags: g.industry, style_tags: [...g.style, PALETTES[palette].bg < "#8" ? "dark" : "light"],
  archetype: g.archetype, min_plan_code: TIER[i], sort: i * 10 + gi,
  config: { hero, card, fonts: { heading, body }, colors: PALETTES[palette], button, columns: g.columns, effects },
})));
export const DEFAULT_TEMPLATE = "campus-classic";

export type EffectDef = {
  slug: string; name: string; description: string; category: string; renderer: "css" | "canvas" | "three" | "lottie"; min_plan_code: string;
  params_schema: { color?: boolean; direction?: boolean; density?: boolean }; sort: number;
  id?: string; asset_path?: string | null; is_active?: boolean; preview_path?: string | null;
};
const E = (slug: string, name: string, category: string, renderer: EffectDef["renderer"], plan: string, description: string, params: EffectDef["params_schema"] = { color: true }): Omit<EffectDef, "sort"> =>
  ({ slug, name, description, category, renderer, min_plan_code: plan, params_schema: params });
export const EFFECTS: EffectDef[] = [
  E("aurora", "Aurora glow", "Abstract", "css", "k-leg", "Two soft blobs of colour that drift slowly."),
  E("soft-glow", "Soft glow", "Luxury", "css", "k-leg", "A gentle breathing halo of light."),
  E("floating-dots", "Floating dots", "Minimalist", "css", "k-leg", "A quiet pattern of dots sliding past."),
  E("grid-pulse", "Grid pulse", "Technology", "css", "k-leg", "A thin grid that fades in and out."),
  E("shine-sweep", "Shine sweep", "Professional", "css", "k-leg", "A band of light crossing every few seconds.", {}),
  E("scanlines", "Scanlines", "Gaming", "css", "no-dulling", "Old-screen lines rolling down, like a paused anime frame.", {}),
  E("rain", "Rain", "Anime", "canvas", "no-dulling", "Slanted rain with a direction you choose.", { color: true, direction: true, density: true }),
  E("clouds", "Drifting clouds", "Anime", "canvas", "no-dulling", "Painted clouds sliding across the sky.", { color: true, density: true }),
  E("starfield", "Starfield", "Anime", "canvas", "no-dulling", "Twinkling stars with the odd shooting star.", { color: true, density: true }),
  E("neon-skyline", "Neon skyline", "Cyberpunk", "canvas", "no-dulling", "A city silhouette with windows that flicker on and off.", { color: true }),
  E("petals", "Falling petals", "Anime", "canvas", "no-dulling", "Petals turning as they fall on the wind.", { color: true, direction: true, density: true }),
  E("sunset-sky", "Sunset sky", "Cinematic", "canvas", "no-dulling", "A slow gradient sky with a low sun.", { color: true }),
  E("snow", "Snow", "Nature", "canvas", "no-dulling", "Light flakes drifting down.", { color: true, direction: true, density: true }),
  E("fireflies", "Fireflies", "Nature", "canvas", "no-dulling", "Small lights wandering and blinking.", { color: true, density: true }),
  E("bubbles", "Bubbles", "Abstract", "canvas", "no-dulling", "Outlined bubbles floating upward.", { color: true, density: true }),
  E("embers", "Embers", "Cinematic", "canvas", "no-dulling", "Sparks rising from below.", { color: true, density: true }),
  E("confetti", "Confetti", "Streetwear", "canvas", "no-dulling", "Coloured paper tumbling down.", { density: true }),
  E("speed-lines", "Speed lines", "Anime", "canvas", "odogwu", "Manga action lines bursting from a point.", { color: true, density: true }),
  E("data-stream", "Data stream", "Technology", "canvas", "odogwu", "Columns of falling characters.", { color: true, density: true }),
  E("aurora-ribbons", "Aurora ribbons", "Futuristic", "canvas", "odogwu", "Flowing ribbons of light.", { color: true }),
  E("lightning", "Lightning", "Cinematic", "canvas", "odogwu", "Occasional forks of lightning and a flash.", { color: true }),
  E("orbit-crystal", "Orbit crystal (3D)", "Futuristic", "three", "odogwu", "A wireframe crystal turning in 3D. Desktop only.", { color: true }),
  E("particle-wave", "Particle wave (3D)", "Gaming", "three", "odogwu", "A rolling field of 3D points. Desktop only.", { color: true }),
  E("my-lottie", "Your own Lottie animation", "Professional", "lottie", "odogwu", "Play a Lottie file you uploaded.", {}),
].map((e, i) => ({ ...e, sort: i }));
export const EFFECT_CATEGORIES = ["Anime", "Gaming", "Cyberpunk", "Luxury", "Futuristic", "Minimalist", "Nature", "Abstract", "Streetwear", "Technology", "Cinematic", "Professional"] as const;

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));
    return .2126 * r + .7152 * g + .0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + .05) / (y + .05);
}
