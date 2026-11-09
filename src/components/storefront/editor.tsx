"use client";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Monitor, Plus, Redo2, Smartphone, Tablet, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { publishDesign, saveDraft } from "@/app/actions/storefront";
import { toast } from "@/components/toast";
import {
  ANCHORS, BUTTONS, EFFECT_CATEGORIES, FONTS, FONT_IDS, PALETTES, SECTION_LABEL, contrast, layer,
  type Anchor, type Design, type EffectLayer, type FontId, type Template,
} from "@/lib/storefront-catalog";
import type { MediaItem } from "@/lib/storefront-access";
import type { StoreContent } from "@/lib/storefront";
import { EffectLayers, type FxAssets } from "./effects";
import { StorefrontView } from "./view";

export type EditorAsset = { slug: string; name: string; description: string; category: string; renderer: string; params_schema: { color?: boolean; direction?: boolean; density?: boolean }; locked: boolean; needName: string };
type Limits = { layers: number; animatedBanner: boolean; typeControls: boolean; lottie: boolean; parallax: boolean };
type Props = {
  initial: Design; published: Design | null; templates: Template[]; assets: EditorAsset[]; fx: FxAssets; media: MediaItem[]; content: StoreContent;
  limits: Limits; planName: string; nextPlan: Record<string, string>;
};
type Tab = "template" | "branding" | "colours" | "type" | "banner" | "effects" | "sections" | "products";
const TABS: [Tab, string][] = [["template", "Template"], ["branding", "Branding"], ["colours", "Colours"], ["type", "Typography"], ["banner", "Banner and media"], ["effects", "Effects"], ["sections", "Sections"], ["products", "Product display"]];
const WIDTHS = { desktop: 1200, tablet: 820, mobile: 390 } as const;
const COLOR_LABEL: Record<keyof Design["colors"], string> = { bg: "Background", surface: "Cards and panels", text: "Text", muted: "Secondary text", accent: "Accent (buttons)", accentText: "Text on accent" };

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const fx = (f: FontId) => FONTS[f][1];

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm font-medium">{label}{children}{hint && <span className="mt-0.5 block text-xs font-normal text-mute">{hint}</span>}</label>;
}
function Range({ label, value, min, max, step, onChange, suffix = "", disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string; disabled?: boolean }) {
  return (
    <label className="block text-sm font-medium">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-mute">{Math.round(value * 100) / 100}{suffix}</span></span>
      <input type="range" className="mt-1 w-full accent-[#7c3aed]" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
function Locked({ need }: { need: string }) {
  return <Link href="/seller/billing" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold"><Lock size={11} aria-hidden />{need}</Link>;
}
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-1 flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-lg border px-2.5 py-1 text-sm ${value === v ? "border-palm bg-mint text-ink" : "border-line text-ink-3 hover:border-palm"}`}>{l}</button>
      ))}
    </div>
  );
}

function EffectPreview({ a, fxAssets }: { a: EditorAsset; fxAssets: FxAssets }) {
  const [on, set] = useState(false);
  return (
    <div className="relative h-16 overflow-hidden rounded-lg bg-gradient-to-br from-[#1a1228] to-[#070509]"
      onMouseEnter={() => set(true)} onMouseLeave={() => set(false)} onFocus={() => set(true)} onBlur={() => set(false)} onTouchStart={() => set(true)}>
      {on && a.renderer !== "lottie" && <EffectLayers zone="back" assets={fxAssets} lottie={{}} accent="#a78bfa" layers={[{ l: layer(a.slug, { id: `p${a.slug.replace(/[^a-z0-9]/g, "").slice(0, 10)}`, opacity: .9 }), index: 0 }]} />}
      {!on && <span className="absolute inset-0 grid place-items-center text-xs text-mute">{a.renderer === "lottie" ? "Your file" : "Hover or tap to play"}</span>}
    </div>
  );
}

export function Editor(p: Props) {
  const router = useRouter();
  const [state, setState] = useState({ d: p.initial, past: [] as Design[], future: [] as Design[] });
  const d = state.d;
  const [savedJson, setSavedJson] = useState(JSON.stringify(p.initial));
  const [tab, setTab] = useState<Tab>("template");
  const [pane, setPane] = useState<"controls" | "preview" | "settings">("controls");
  const [device, setDevice] = useState<keyof typeof WIDTHS>("desktop");
  useEffect(() => { if (window.innerWidth < 640) setDevice("mobile"); else if (window.innerWidth < 1024) setDevice("tablet"); }, []);
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [busy, start] = useTransition();
  const dirty = JSON.stringify(d) !== savedJson;

  const set = (fn: (d: Design) => Design) => setState((s) => {
    const next = fn(s.d);
    return JSON.stringify(next) === JSON.stringify(s.d) ? s : { d: next, past: [...s.past.slice(-49), s.d], future: [] };
  });
  const undo = () => setState((s) => s.past.length ? { d: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.d, ...s.future] } : s);
  const redo = () => setState((s) => s.future.length ? { d: s.future[0], past: [...s.past, s.d], future: s.future.slice(1) } : s);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input[type=text],input[type=number],textarea")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener("beforeunload", warn); return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const template = p.templates.find((t) => t.slug === d.template) ?? p.templates[0];
  const selected = d.effects.find((e) => e.id === sel) ?? null;
  const assetBy = useMemo(() => Object.fromEntries(p.assets.map((a) => [a.slug, a])), [p.assets]);
  const banners = p.media.filter((m) => m.kind !== "lottie" && m.status === "active");
  const lotties = p.media.filter((m) => m.kind === "lottie" && m.status === "active");

  const warnings = useMemo(() => {
    const c = d.colors; const out: string[] = [];
    const chk = (a: string, b: string, what: string) => { const r = contrast(a, b); if (r < 4.5) out.push(`${what} contrast is ${r.toFixed(1)}:1. WCAG AA needs 4.5:1.`); };
    chk(c.text, c.bg, "Text on background"); chk(c.text, c.surface, "Text on cards"); chk(c.muted, c.bg, "Secondary text"); chk(c.accentText, c.accent, "Button text");
    return out;
  }, [d.colors]);
  const problems = useMemo(() => {
    const out: string[] = [];
    if (d.effects.length > p.limits.layers) out.push(`Your plan allows ${p.limits.layers} effect layers.`);
    for (const e of d.effects) if (assetBy[e.asset]?.locked) out.push(`${assetBy[e.asset].name} needs ${assetBy[e.asset].needName}.`);
    const m = banners.find((x) => x.id === d.hero.mediaId);
    if (m && m.kind !== "image" && !p.limits.animatedBanner) out.push(`GIF and video banners need ${p.nextPlan.animated}.`);
    if (m?.kind === "video" && !m.posterUrl) out.push("Your video banner needs a poster image.");
    if (d.hero.parallax && !p.limits.parallax) out.push(`Parallax needs ${p.nextPlan.full}.`);
    if (!p.limits.typeControls && (d.typeScale !== 1 || d.button !== template.config.button)) out.push(`Font size and button style need ${p.nextPlan.animated}.`);
    for (const e of d.effects) if (assetBy[e.asset]?.renderer === "lottie" && !e.mediaId) out.push("Pick a Lottie file for your Lottie layer.");
    return out;
  }, [d, p.limits, p.nextPlan, assetBy, banners, template]);

  const run = (fn: typeof saveDraft, msg?: string, after?: () => void) => start(async () => {
    const json = JSON.stringify(d);
    const r = await fn({}, fd({ design: json }));
    if (r.error) toast(r.error, "error"); else { toast(msg ?? r.message ?? "Saved."); setSavedJson(json); after?.(); router.refresh(); }
  });

  // Preview scaling: the preview renders at the real device width and is scaled down to fit the panel.
  const frame = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(800);
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width)); ro.observe(el);
    return () => ro.disconnect();
  }, [pane]);
  const w = WIDTHS[device]; const scale = Math.min(1, avail / w);

  const updLayer = (id: string, patch: Partial<EffectLayer>) => set((x) => ({ ...x, effects: x.effects.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  const addEffect = (a: EditorAsset) => {
    if (a.locked) return toast(`${a.name} needs ${a.needName}.`, "error");
    if (d.effects.length >= p.limits.layers) return toast(`Your plan allows ${p.limits.layers} effect layers. Remove one first.`, "error");
    if (a.renderer === "lottie" && !lotties.length) return toast("Upload a Lottie file in Banners and media first.", "error");
    const l = layer(a.slug, { mediaId: a.renderer === "lottie" ? lotties[0].id : null, id: Math.random().toString(36).slice(2, 10) });
    set((x) => ({ ...x, effects: [...x.effects, l] })); setSel(l.id); setPane("settings");
    toast(`${a.name} added. Adjust it on the right.`);
  };
  const moveSection = (i: number, dir: -1 | 1) => set((x) => {
    const s = [...x.sections]; const j = i + dir; if (j < 0 || j >= s.length) return x;
    [s[i], s[j]] = [s[j], s[i]]; return { ...x, sections: s };
  });

  const controls: Record<Tab, () => ReactNode> = {
    template: () => (
      <div className="space-y-3">
        <p className="text-sm">Current template: <b>{template.name}</b></p>
        <p className="text-sm text-mute">{template.description}</p>
        <Link href="/seller/storefront/designs" className="inline-block rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-palm">Browse all designs</Link>
        <button type="button" className="block text-sm font-semibold text-palm-deep underline"
          onClick={() => set((x) => ({ ...x, colors: { ...template.config.colors }, fonts: { ...template.config.fonts }, typeScale: 1, button: template.config.button }))}>Reset colours and fonts to the template</button>
      </div>
    ),
    branding: () => (
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.content.store.logo ? <img src={p.content.store.logo} alt="" className="size-12 rounded-xl object-cover" /> : <span className="grid size-12 place-items-center rounded-xl bg-white/10 font-bold">{p.content.store.name[0]}</span>}
          <div><p className="font-bold">{p.content.store.name}</p><p className="text-mute">{p.content.store.tagline ?? "No tagline yet"}</p></div>
        </div>
        <p className="text-mute">Name, tagline, logo, cover, contact details, social links, announcement and policies are saved straight away on the overview page, so they appear on your store without publishing.</p>
        <Link href="/seller/storefront" className="inline-block rounded-lg border border-line px-3 py-1.5 font-semibold hover:border-palm">Edit store details</Link>
      </div>
    ),
    colours: () => (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Palettes</p>
          <div className="mt-1 grid grid-cols-6 gap-1.5">
            {Object.entries(PALETTES).map(([k, c]) => (
              <button key={k} type="button" title={k} aria-label={`Use the ${k} palette`} onClick={() => set((x) => ({ ...x, colors: { ...c } }))}
                className="h-8 rounded-md border border-line" style={{ background: `linear-gradient(135deg, ${c.bg} 50%, ${c.accent} 50%)` }} />
            ))}
          </div>
        </div>
        {(Object.keys(COLOR_LABEL) as (keyof Design["colors"])[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2 text-sm font-medium">{COLOR_LABEL[k]}
            <span className="flex items-center gap-2">
              <input type="text" aria-label={`${COLOR_LABEL[k]} hex`} className="input w-24 py-1 font-mono text-sm" defaultValue={d.colors[k]} key={d.colors[k]}
                onBlur={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && set((x) => ({ ...x, colors: { ...x.colors, [k]: e.target.value.toLowerCase() } }))} />
              <input type="color" aria-label={COLOR_LABEL[k]} value={d.colors[k]} onChange={(e) => set((x) => ({ ...x, colors: { ...x.colors, [k]: e.target.value } }))} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
            </span>
          </label>
        ))}
        {warnings.length > 0 && <div role="status" className="rounded-lg border border-sun/50 bg-sun/10 p-2 text-xs text-ink">{warnings.map((w) => <p key={w}>{w}</p>)}</div>}
      </div>
    ),
    type: () => (
      <div className="space-y-3">
        {(["heading", "body"] as const).map((k) => (
          <Row key={k} label={k === "heading" ? "Heading font" : "Body font"}>
            <select className="input mt-1 py-2" value={d.fonts[k]} style={{ fontFamily: fx(d.fonts[k]) }} onChange={(e) => set((x) => ({ ...x, fonts: { ...x.fonts, [k]: e.target.value as FontId } }))}>
              {FONT_IDS.map((f) => <option key={f} value={f} style={{ fontFamily: fx(f) }}>{FONTS[f][0]}</option>)}
            </select>
          </Row>
        ))}
        <div className="flex items-center justify-between"><span className="text-sm font-medium">Font size and button style</span>{!p.limits.typeControls && <Locked need={p.nextPlan.animated} />}</div>
        <Range label="Text size" value={d.typeScale} min={.85} max={1.25} step={.05} suffix="x" disabled={!p.limits.typeControls} onChange={(n) => set((x) => ({ ...x, typeScale: n }))} />
        <div className={p.limits.typeControls ? "" : "pointer-events-none opacity-50"}>
          <Seg label="Button style" value={d.button} options={BUTTONS.map((b) => [b, b[0].toUpperCase() + b.slice(1)])} onChange={(v) => set((x) => ({ ...x, button: v }))} />
        </div>
      </div>
    ),
    banner: () => (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => set((x) => ({ ...x, hero: { ...x.hero, mediaId: null } }))} aria-pressed={!d.hero.mediaId}
            className={`grid aspect-video place-items-center rounded-lg border text-xs ${!d.hero.mediaId ? "border-palm" : "border-line"}`}>Cover image</button>
          {banners.map((m) => {
            const locked = m.kind !== "image" && !p.limits.animatedBanner;
            return (
              <button key={m.id} type="button" disabled={locked} aria-pressed={d.hero.mediaId === m.id} onClick={() => set((x) => ({ ...x, hero: { ...x.hero, mediaId: m.id } }))}
                className={`relative aspect-video overflow-hidden rounded-lg border ${d.hero.mediaId === m.id ? "border-palm ring-2 ring-palm" : "border-line"} disabled:opacity-40`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {(m.kind === "video" ? m.posterUrl : m.url) ? <img src={(m.kind === "video" ? m.posterUrl : m.url)!} alt="" className="size-full object-cover" /> : <span className="text-xs">Video, no poster</span>}
                <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] uppercase text-white">{m.kind}</span>
              </button>
            );
          })}
        </div>
        <Link href="/seller/storefront/media" className="inline-block text-sm font-semibold text-palm-deep underline">Upload banners</Link>
        <Seg label="Height" value={d.hero.height} options={[["sm", "Short"], ["md", "Medium"], ["lg", "Tall"]]} onChange={(v) => set((x) => ({ ...x, hero: { ...x.hero, height: v } }))} />
        <Seg label="Focus" value={d.hero.position} options={[["top", "Top"], ["center", "Centre"], ["bottom", "Bottom"]]} onChange={(v) => set((x) => ({ ...x, hero: { ...x.hero, position: v } }))} />
        <Range label="Banner opacity" value={d.hero.opacity} min={20} max={100} step={5} suffix="%" onChange={(n) => set((x) => ({ ...x, hero: { ...x.hero, opacity: n } }))} />
        <Range label="Overlay" value={d.hero.overlay} min={0} max={90} step={5} suffix="%" onChange={(n) => set((x) => ({ ...x, hero: { ...x.hero, overlay: n } }))} />
        <label className="flex items-center justify-between text-sm font-medium">Overlay colour<input type="color" value={d.hero.overlayColor} onChange={(e) => set((x) => ({ ...x, hero: { ...x.hero, overlayColor: e.target.value } }))} className="h-8 w-10 rounded border border-line bg-transparent" /></label>
        <label className="flex items-center justify-between gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><input type="checkbox" checked={d.hero.parallax} disabled={!p.limits.parallax && !d.hero.parallax} onChange={(e) => set((x) => ({ ...x, hero: { ...x.hero, parallax: e.target.checked } }))} />Parallax scrolling</span>
          {!p.limits.parallax && <Locked need={p.nextPlan.full} />}
        </label>
      </div>
    ),
    effects: () => (
      <div className="space-y-3">
        <p className="text-sm">Layers: <b>{d.effects.length} of {p.limits.layers}</b> on {p.planName}. Phones show at most 3.</p>
        {d.effects.length > 0 && (
          <ul className="space-y-1">{d.effects.map((e, i) => (
            <li key={e.id}>
              <button type="button" onClick={() => { setSel(e.id); setPane("settings"); }} aria-pressed={sel === e.id}
                className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-sm ${sel === e.id ? "border-palm" : "border-line"}`}>
                <span>{i + 1}. {assetBy[e.asset]?.name ?? e.asset}</span><span className="text-xs text-mute">{e.scope === "hero" ? "Banner" : "Whole page"}, {e.layer === "back" ? "behind" : "in front"}</span>
              </button>
            </li>
          ))}</ul>
        )}
        <label className="text-sm font-medium">Library
          <select className="input mt-1 py-2" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{EFFECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <div className="grid gap-2">{p.assets.filter((a) => !cat || a.category === cat).map((a) => (
          <div key={a.slug} className="rounded-lg border border-line p-2" data-effect={a.slug}>
            <EffectPreview a={a} fxAssets={p.fx} />
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-sm font-semibold">{a.name}</p><p className="text-xs text-mute">{a.category} · {a.description}</p></div>
              {a.locked ? <Locked need={a.needName} /> : <button type="button" onClick={() => addEffect(a)} className="flex shrink-0 items-center gap-1 rounded-lg bg-palm px-2 py-1 text-xs font-semibold text-white"><Plus size={12} aria-hidden />Add</button>}
            </div>
          </div>
        ))}</div>
      </div>
    ),
    sections: () => (
      <ul className="space-y-1.5">
        {d.sections.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-sm">
            <span className={s.visible ? "" : "text-mute line-through"}>{SECTION_LABEL[s.id]}</span>
            <span className="flex gap-1">
              <button type="button" aria-label={`Move ${SECTION_LABEL[s.id]} up`} disabled={i === 0} onClick={() => moveSection(i, -1)} className="rounded p-1 hover:bg-white/10 disabled:opacity-30"><ArrowUp size={15} /></button>
              <button type="button" aria-label={`Move ${SECTION_LABEL[s.id]} down`} disabled={i === d.sections.length - 1} onClick={() => moveSection(i, 1)} className="rounded p-1 hover:bg-white/10 disabled:opacity-30"><ArrowDown size={15} /></button>
              <button type="button" aria-label={`${s.visible ? "Hide" : "Show"} ${SECTION_LABEL[s.id]}`} aria-pressed={!s.visible}
                onClick={() => set((x) => ({ ...x, sections: x.sections.map((y) => y.id === s.id ? { ...y, visible: !y.visible } : y) }))} className="rounded p-1 hover:bg-white/10">{s.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
            </span>
          </li>
        ))}
        <li className="pt-1 text-xs text-mute">Sections with nothing in them (no services, no policies) hide themselves automatically.</li>
      </ul>
    ),
    products: () => (
      <div className="space-y-3">
        <Seg label="Columns on desktop" value={String(d.products.columns) as "2" | "3" | "4"} options={[["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(v) => set((x) => ({ ...x, products: { ...x.products, columns: Number(v) as 2 | 3 | 4 } }))} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.products.showStock} onChange={(e) => set((x) => ({ ...x, products: { ...x.products, showStock: e.target.checked } }))} />Show stock levels</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.products.showRating} onChange={(e) => set((x) => ({ ...x, products: { ...x.products, showRating: e.target.checked } }))} />Show ratings</label>
        <p className="text-xs text-mute">Card style comes from your template. Prices and stock always come from your listings.</p>
      </div>
    ),
  };

  const settings = selected ? (() => {
    const a = assetBy[selected.asset]; const ps = a?.params_schema ?? {};
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-bold">{a?.name ?? selected.asset}</h3>
          <button type="button" onClick={() => { set((x) => ({ ...x, effects: x.effects.filter((e) => e.id !== selected.id) })); setSel(null); }} className="flex items-center gap-1 text-sm text-coral"><Trash2 size={14} aria-hidden />Remove</button></div>
        {a?.locked && <p className="text-sm text-sun">This effect needs {a.needName}. It stays switched off on your store until you upgrade or remove it.</p>}
        {a?.renderer === "lottie" && (
          <Row label="Lottie file"><select className="input mt-1 py-2" value={selected.mediaId ?? ""} onChange={(e) => updLayer(selected.id, { mediaId: e.target.value || null })}>
            <option value="">Choose a file</option>{lotties.map((m, i) => <option key={m.id} value={m.id}>Lottie {i + 1}</option>)}</select></Row>
        )}
        <Seg label="Where" value={selected.scope} options={[["hero", "Banner"], ["page", "Whole page"]]} onChange={(v) => updLayer(selected.id, { scope: v })} />
        <Seg label="Layer" value={selected.layer} options={[["back", "Behind content"], ["front", "In front"]]} onChange={(v) => updLayer(selected.id, { layer: v })} />
        <div>
          <p className="text-sm font-medium">Anchor</p>
          <div role="radiogroup" aria-label="Anchor" className="mt-1 grid w-28 grid-cols-3 gap-1">
            {ANCHORS.map((an) => <button key={an} type="button" role="radio" aria-checked={selected.anchor === an} aria-label={an.replace("-", " ")} onClick={() => updLayer(selected.id, { anchor: an as Anchor })}
              className={`h-7 rounded border ${selected.anchor === an ? "border-palm bg-palm" : "border-line hover:border-palm"}`} />)}
          </div>
        </div>
        <Range label="Size" value={selected.size} min={10} max={100} step={5} suffix="%" onChange={(n) => updLayer(selected.id, { size: n })} />
        <Range label="Offset across" value={selected.x} min={-50} max={50} step={1} suffix="%" onChange={(n) => updLayer(selected.id, { x: n })} />
        <Range label="Offset down" value={selected.y} min={-50} max={50} step={1} suffix="%" onChange={(n) => updLayer(selected.id, { y: n })} />
        <Range label="Opacity" value={selected.opacity} min={.05} max={1} step={.05} onChange={(n) => updLayer(selected.id, { opacity: n })} />
        <Range label="Speed" value={selected.speed} min={.25} max={3} step={.25} suffix="x" onChange={(n) => updLayer(selected.id, { speed: n })} />
        {ps.direction && <Range label="Direction" value={selected.direction} min={0} max={359} step={5} suffix="°" onChange={(n) => updLayer(selected.id, { direction: n })} />}
        {ps.density && <Range label="Density" value={selected.density} min={.2} max={2} step={.1} suffix="x" onChange={(n) => updLayer(selected.id, { density: n })} />}
        {ps.color && (
          <label className="flex items-center justify-between text-sm font-medium">Colour
            <span className="flex items-center gap-2">
              <button type="button" className="text-xs underline" onClick={() => updLayer(selected.id, { color: null })}>Use accent</button>
              <input type="color" value={selected.color ?? d.colors.accent} onChange={(e) => updLayer(selected.id, { color: e.target.value })} className="h-8 w-10 rounded border border-line bg-transparent" />
            </span>
          </label>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={d.effects[0]?.id === selected.id} className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-30"
            onClick={() => set((x) => { const i = x.effects.findIndex((e) => e.id === selected.id); const e = [...x.effects]; [e[i - 1], e[i]] = [e[i], e[i - 1]]; return { ...x, effects: e }; })}>Draw earlier</button>
          <button type="button" disabled={d.effects.at(-1)?.id === selected.id} className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-30"
            onClick={() => set((x) => { const i = x.effects.findIndex((e) => e.id === selected.id); const e = [...x.effects]; [e[i + 1], e[i]] = [e[i], e[i + 1]]; return { ...x, effects: e }; })}>Draw later</button>
        </div>
        <button type="button" className="text-sm underline" onClick={() => setSel(null)}>Done</button>
      </div>
    );
  })() : (
    <div className="space-y-3 text-sm">
      <p className="text-mute">Pick an effect layer in Effects to adjust it here.</p>
      <div>
        <h3 className="font-bold">Before you publish</h3>
        {problems.length === 0 && warnings.length === 0 ? <p className="mt-1 text-palm-deep">Everything in this design is on your plan.</p> : (
          <ul className="mt-1 list-disc space-y-1 pl-4">{problems.map((x) => <li key={x}>{x}</li>)}{warnings.map((x) => <li key={x} className="text-mute">{x}</li>)}</ul>
        )}
        {problems.length > 0 && <Link href="/seller/billing" className="mt-2 inline-block font-semibold text-palm-deep underline">See plans</Link>}
      </div>
    </div>
  );

  const deviceBtn = (k: keyof typeof WIDTHS, icon: ReactNode, label: string) => (
    <button type="button" aria-label={`${label} preview`} aria-pressed={device === k} onClick={() => setDevice(k)} className={`rounded-lg p-1.5 ${device === k ? "bg-white/15" : "hover:bg-white/10"}`}>{icon}</button>
  );

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8" data-editor>
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <button type="button" onClick={undo} disabled={!state.past.length} aria-label="Undo" className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"><Undo2 size={17} /></button>
        <button type="button" onClick={redo} disabled={!state.future.length} aria-label="Redo" className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"><Redo2 size={17} /></button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {deviceBtn("desktop", <Monitor size={17} />, "Desktop")}{deviceBtn("tablet", <Tablet size={17} />, "Tablet")}{deviceBtn("mobile", <Smartphone size={17} />, "Mobile")}
        <span className="ml-auto text-xs text-mute" aria-live="polite">{busy ? "Working..." : dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="button" disabled={busy} onClick={() => run(saveDraft)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-palm">Save draft</button>
        <button type="button" disabled={busy} onClick={() => run(saveDraft, "Draft saved. Opening preview.", () => router.push("/seller/storefront/preview"))} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-palm">Preview</button>
        <button type="button" disabled={busy} onClick={() => { if (confirm("Publish this design? Buyers will see it straight away.")) run(publishDesign); }} className="rounded-lg bg-palm px-3 py-1.5 text-sm font-semibold text-white hover:bg-palm-hover">Publish</button>
      </div>

      <div className="flex border-b border-line lg:hidden" role="tablist" aria-label="Editor panels">
        {([["controls", "Controls"], ["preview", "Preview"], ["settings", "Settings"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)} className={`flex-1 py-2 text-sm font-semibold ${pane === k ? "border-b-2 border-palm" : "text-mute"}`}>{l}</button>
        ))}
      </div>

      <div className="lg:grid lg:h-[calc(100dvh-104px)] lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className={`${pane === "controls" ? "" : "hidden"} border-line lg:block lg:overflow-y-auto lg:border-r`} aria-label="Design controls">
          <div className="flex flex-wrap gap-1 p-3 lg:flex-col">
            {TABS.map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-2.5 py-1.5 text-left text-sm font-medium ${tab === k ? "bg-white/12 text-ink" : "text-ink-3 hover:bg-white/5"}`}>{l}</button>)}
          </div>
          <div className="border-t border-line p-3">{controls[tab]()}</div>
        </aside>
        <section className={`${pane === "preview" ? "" : "hidden"} min-w-0 bg-[#0b0810] p-3 lg:flex lg:flex-col`} aria-label="Live preview">
          <div ref={frame} className="w-full overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="h-[calc(100dvh-190px)] overflow-auto rounded-lg border border-line lg:h-full">
              <div style={{ width: w, zoom: scale, margin: "0 auto" }}>
                <StorefrontView content={p.content} design={d} template={template} media={p.media} assets={p.fx} preview isOwner={false} />
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-mute">{w}px wide{scale < 1 ? `, shown at ${Math.round(scale * 100)}%` : ""}. Live updates as you edit.</p>
        </section>
        <aside className={`${pane === "settings" ? "" : "hidden"} border-line p-3 lg:block lg:overflow-y-auto lg:border-l`} aria-label="Selected item settings">{settings}</aside>
      </div>
    </div>
  );
}
