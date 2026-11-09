"use client";
import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { chooseTemplate } from "@/app/actions/storefront";
import { Form, Submit } from "@/components/form";
import { ARCHETYPE_LABEL, HERO_LABEL, type Template } from "@/lib/storefront-catalog";
import type { FxAssets } from "./effects";
import { TemplateThumb, useHoverPlay } from "./thumb";

type G = Template & { locked: boolean; needName: string; preview: string | null; mobilePreview: string | null };

function Tile({ t, assets, current }: { t: G; assets: FxAssets; current: boolean }) {
  const { on, bind } = useHoverPlay();
  const effects = t.config.effects.map((e) => e.asset).filter(Boolean);
  return (
    <article {...bind} tabIndex={-1} className={`flex flex-col rounded-tag border bg-card p-3 ${current ? "border-palm" : "border-line"}`} data-template={t.slug} data-locked={t.locked || undefined}>
      {t.preview ? (
        <div className="flex gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.preview} alt="" loading="lazy" className="aspect-[4/3] min-w-0 flex-1 rounded-lg object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {t.mobilePreview && <img src={t.mobilePreview} alt="" loading="lazy" className="aspect-[9/16] w-[26%] rounded-lg object-cover" />}
        </div>
      ) : <TemplateThumb t={t} assets={assets} animate={on} />}
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold">{t.name}</h3>
          <p className="text-xs text-mute">{ARCHETYPE_LABEL[t.archetype]} · {HERO_LABEL[t.config.hero]}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.locked ? "bg-white/10 text-mute" : "bg-mint text-palm-deep"}`}>{t.needName}</span>
      </div>
      <p className="mt-1 flex-1 text-sm text-ink-3">{t.description}</p>
      {effects.length > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-mute"><Sparkles size={12} aria-hidden />{effects.join(", ").replaceAll("-", " ")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/seller/storefront/preview?template=${t.slug}`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-palm">Preview with my products</Link>
        {current ? <span className="px-2 py-1.5 text-sm font-semibold text-palm-deep">In your draft</span>
          : t.locked ? <Link href="/seller/billing" className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold"><Lock size={13} aria-hidden />Unlock with {t.needName}</Link>
          : (
            <Form action={chooseTemplate} toastOnly className="inline-block">
              <input type="hidden" name="slug" value={t.slug} />
              <Submit size="sm" confirm="Switch to this template? Your products, banner and section order stay. Colours, fonts and effects change to this template's, and effects your plan doesn't include are left out. Nothing goes live until you publish.">Select</Submit>
            </Form>
          )}
      </div>
    </article>
  );
}

export function Gallery({ templates, assets, current }: { templates: G[]; assets: FxAssets; current: string }) {
  const [f, setF] = useState({ category: "", style: "", animation: "", industry: "", access: "" });
  const opts = useMemo(() => ({
    category: [...new Set(templates.map((t) => t.category))].sort(),
    style: [...new Set(templates.flatMap((t) => t.style_tags))].sort(),
    industry: [...new Set(templates.flatMap((t) => t.industry_tags))].sort(),
  }), [templates]);
  const anim = (t: G) => {
    const r = t.config.effects.map((e) => assets[e.asset!]?.renderer);
    return !r.length ? "none" : r.includes("three") ? "3d" : r.includes("canvas") ? "scene" : "subtle";
  };
  const shown = templates.filter((t) => (!f.category || t.category === f.category) && (!f.style || t.style_tags.includes(f.style)) && (!f.industry || t.industry_tags.includes(f.industry))
    && (!f.animation || anim(t) === f.animation) && (!f.access || (f.access === "open" ? !t.locked : t.locked)));
  const sel = (k: keyof typeof f, label: string, options: [string, string][]) => (
    <label className="text-sm font-medium">{label}
      <select className="input mt-1 py-2" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">All</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {sel("category", "Category", opts.category.map((c) => [c, c]))}
        {sel("style", "Style", opts.style.map((c) => [c, cap(c)]))}
        {sel("animation", "Animation", [["none", "No animation"], ["subtle", "Subtle"], ["scene", "Animated scene"], ["3d", "3D"]])}
        {sel("industry", "Industry", opts.industry.map((c) => [c, cap(c)]))}
        {sel("access", "Access", [["open", "On my plan"], ["locked", "Needs upgrade"]])}
      </div>
      <p className="mt-3 text-sm text-mute" aria-live="polite">{shown.length} of {templates.length} templates. Hover or tap a card to play its animation.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((t) => <Tile key={t.slug} t={t} assets={assets} current={t.slug === current} />)}</div>
    </>
  );
}
