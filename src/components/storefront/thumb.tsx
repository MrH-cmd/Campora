"use client";
import { useState } from "react";
import { FONTS, type Template } from "@/lib/storefront-catalog";
import { EffectLayers, type FxAssets } from "./effects";
import { layer } from "@/lib/storefront-catalog";
import "./storefront.css";

/** A miniature of a template at desktop and phone size, drawn from its own colours, fonts, hero and card style. */
export function TemplateThumb({ t, assets, animate }: { t: Template; assets: FxAssets; animate: boolean }) {
  const c = t.config.colors; const hero = t.config.hero;
  const fh = FONTS[t.config.fonts.heading][1]; const fb = FONTS[t.config.fonts.body][1];
  const radius = t.config.button === "pill" ? 99 : t.config.button === "square" ? 0 : 6;
  const cardR = t.config.card === "round" ? 10 : t.config.card === "clip" || t.config.card === "bordered" ? 0 : 4;
  const Hero = ({ h }: { h: number }) => (
    <div style={{ position: "relative", height: h, overflow: "hidden", display: "grid", gridTemplateColumns: hero === "split" || hero === "arch" ? "1fr 1fr" : "1fr", gap: 4, padding: hero === "frame" ? 4 : 0 }}>
      {(hero === "split") && <div style={{ padding: 6 }}><Lines c={c.text} f={fh} /></div>}
      <div style={{ background: `linear-gradient(135deg, ${c.accent}, ${c.surface})`, borderRadius: hero === "arch" ? "999px 999px 4px 4px" : hero === "frame" ? 6 : 0, position: "relative", overflow: "hidden" }}>
        {animate && <EffectLayers zone="back" assets={assets} lottie={{}} accent={c.accent} layers={t.config.effects.filter((e) => assets[e.asset!]?.renderer !== "three" && assets[e.asset!]?.renderer !== "lottie").map((e, index) => ({ l: layer(e.asset!, { ...e, id: `${t.slug}${index}`, size: 100, anchor: "center", x: 0, y: 0 }), index }))} />}
      </div>
      {hero === "arch" && <div style={{ padding: 6 }}><Lines c={c.text} f={fh} /></div>}
      {hero !== "split" && hero !== "arch" && <div style={{ position: "absolute", left: 8, bottom: 6 }}><Lines c={hero === "fullbleed" ? "#fff" : c.text} f={fh} /></div>}
    </div>
  );
  const Card = () => (
    <div style={{ background: t.config.card === "minimal" ? "transparent" : c.surface, border: t.config.card === "bordered" ? `1.5px solid ${c.text}` : "none", borderRadius: cardR, padding: t.config.card === "polaroid" ? 3 : 0, transform: t.config.card === "polaroid" ? "rotate(-2deg)" : undefined }}>
      <div style={{ aspectRatio: "1", background: `${c.muted}55`, borderRadius: cardR }} />
      <div style={{ height: 3, width: "60%", margin: "3px 2px", background: c.text, opacity: .7 }} />
      <div style={{ height: 6, width: "50%", margin: "2px", background: c.accent, borderRadius: radius }} />
    </div>
  );
  const listy = t.archetype === "menu" || t.archetype === "spec";
  return (
    <div className="flex gap-2" aria-hidden>
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-line" style={{ background: c.bg, fontFamily: fb }}>
        <Hero h={58} />
        <div style={{ padding: 6, display: "grid", gridTemplateColumns: listy ? "1fr" : `repeat(${t.config.columns}, 1fr)`, gap: 5 }}>
          {listy ? [0, 1, 2].map((i) => <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", borderBottom: `1px dashed ${c.muted}88`, paddingBottom: 3 }}><div style={{ width: 14, height: 14, background: `${c.muted}55` }} /><div style={{ flex: 1, height: 3, background: c.text, opacity: .6 }} /><div style={{ width: 16, height: 5, background: c.accent }} /></div>)
            : Array.from({ length: t.config.columns }, (_, i) => <Card key={i} />)}
        </div>
      </div>
      <div className="w-[26%] shrink-0 overflow-hidden rounded-lg border border-line" style={{ background: c.bg }}>
        <Hero h={44} />
        <div style={{ padding: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}><Card /><Card /></div>
      </div>
    </div>
  );
}
function Lines({ c, f }: { c: string; f: string }) {
  return <div style={{ fontFamily: f, color: c, fontSize: 11, fontWeight: 700, lineHeight: 1 }}>Aa<div style={{ height: 2, width: 26, marginTop: 3, background: c, opacity: .5 }} /></div>;
}

/** Plays a template's effects while the card is hovered, focused or tapped. */
export function useHoverPlay() {
  const [on, set] = useState(false);
  return { on, bind: { onMouseEnter: () => set(true), onMouseLeave: () => set(false), onFocus: () => set(true), onBlur: () => set(false), onTouchStart: () => set(true) } };
}
