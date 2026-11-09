"use client";
import { useEffect, useRef, useState } from "react";
import type { EffectLayer } from "@/lib/storefront-catalog";
import { MOBILE_LAYER_CAP } from "@/lib/storefront-access";

export type FxAssets = Record<string, { renderer: "css" | "canvas" | "three" | "lottie"; url: string | null }>;
type Handle = { pause: (v: boolean) => void; stop: () => void };
const AX: Record<string, [number, number]> = {
  "top-left": [0, 0], top: [.5, 0], "top-right": [1, 0], left: [0, .5], center: [.5, .5], right: [1, .5], "bottom-left": [0, 1], bottom: [.5, 1], "bottom-right": [1, 1],
};

/** True once we know the visitor has not asked for reduced motion. Nothing animates before that. */
export function useMotionOk() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setOk(!q.matches);
    on(); q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return ok;
}

/** Calls back with whether the element is on screen in a visible tab. */
export function useOnScreen(ref: React.RefObject<HTMLElement | null>, cb: (visible: boolean) => void) {
  const fn = useRef(cb); fn.current = cb;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let seen = true;
    const tell = () => fn.current(seen && !document.hidden);
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; tell(); }, { rootMargin: "80px" });
    io.observe(el); document.addEventListener("visibilitychange", tell);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", tell); };
  }, [ref]);
}

function Fx({ l, index, assets, lottieUrl, accent }: { l: EffectLayer; index: number; assets: FxAssets; lottieUrl: string | null; accent: string }) {
  const box = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const mount = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const [mode, setMode] = useState<"run" | "static" | "skip" | null>(null);
  const [paused, setPaused] = useState(false);
  const def = assets[l.asset]; const color = l.color ?? accent;
  const [ax, ay] = AX[l.anchor] ?? AX.center;

  useEffect(() => {
    const root = box.current?.closest(".sf") as HTMLElement | null;
    const width = root?.clientWidth ?? window.innerWidth;
    if (width < 640 && index >= MOBILE_LAYER_CAP) return setMode("skip");
    if (def?.renderer === "three" && (width < 900 || !window.matchMedia("(pointer: fine)").matches)) return setMode("static");
    setMode("run");
  }, [def?.renderer, index]);

  useEffect(() => {
    if (mode !== "run" || !def) return;
    let dead = false;
    const p = { color, speed: l.speed, density: l.density, direction: l.direction };
    (async () => {
      let h: Handle | null = null;
      if (def.renderer === "canvas" && canvas.current) h = (await import("./effects-canvas")).startCanvas(canvas.current, l.asset, p);
      else if (def.renderer === "three" && mount.current) {
        try { h = (await import("./effects-three")).startThree(mount.current, l.asset, p); } catch { if (!dead) setMode("static"); }
      } else if (def.renderer === "lottie" && mount.current) {
        const url = def.url ?? lottieUrl; if (!url) return;
        const [{ default: lottie }, data] = await Promise.all([import("lottie-web/build/player/lottie_light"), fetch(url).then((r) => r.json()).catch(() => null)]);
        if (!data || dead || !mount.current) return;
        const a = lottie.loadAnimation({ container: mount.current, renderer: "svg", loop: true, autoplay: true, animationData: data });
        a.setSpeed(l.speed);
        h = { pause: (v) => (v ? a.pause() : a.play()), stop: () => a.destroy() };
      }
      if (dead) h?.stop(); else handle.current = h;
    })();
    return () => { dead = true; handle.current?.stop(); handle.current = null; };
  }, [mode, def, l.asset, l.speed, l.density, l.direction, color, lottieUrl]);

  useOnScreen(box, (v) => { handle.current?.pause(!v); setPaused(!v); });
  if (!def || mode === "skip") return <div ref={box} hidden />;
  const style = {
    left: `${(100 - l.size) * ax + l.x}%`, top: `${(100 - l.size) * ay + l.y}%`, width: `${l.size}%`, height: `${l.size}%`, opacity: l.opacity,
    "--fx-c": color, "--fx-s": l.speed,
  } as React.CSSProperties;
  return (
    <div ref={box} className="sf-fx" data-fx={l.asset} data-paused={paused || undefined} style={style}>
      {mode === "static" ? <div className="sf-fx-static" />
        : def.renderer === "css" ? <div className={`sf-fx-${l.asset}`} />
        : def.renderer === "canvas" ? <canvas ref={canvas} />
        : <div ref={mount} />}
    </div>
  );
}

/** Draws the effect layers for one zone (behind or in front of the content) of the hero or the page. */
export function EffectLayers({ layers, zone, assets, lottie, accent }: {
  layers: { l: EffectLayer; index: number }[]; zone: "back" | "front"; assets: FxAssets; lottie: Record<string, string>; accent: string;
}) {
  const ok = useMotionOk();
  if (!ok || !layers.length) return null;
  return (
    <div className="sf-fxwrap" data-layer={zone} aria-hidden>
      {layers.map(({ l, index }) => <Fx key={l.id} l={l} index={index} assets={assets} lottieUrl={l.mediaId ? lottie[l.mediaId] ?? null : null} accent={accent} />)}
    </div>
  );
}
