"use client";
import { Check, Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addToCart, toggleFavourite } from "@/app/actions/shop";
import { toast } from "@/components/toast";
import { useMotionOk, useOnScreen } from "./effects";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const beacon = (storefront_id: string, type: "visit" | "click") => {
  try {
    // Only the referring site's host and a mobile/desktop flag leave the browser, never the full address.
    let ref = ""; try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch {}
    const device = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ? "mobile" : "desktop";
    fetch("/api/store/track", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storefront_id, type, ref, device }) }).catch(() => {});
  } catch {}
};

/** Turns on scroll-in section animations once JavaScript runs, so sections are never hidden without it. */
export function Reveal({ off }: { off?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const ok = useMotionOk();
  useEffect(() => {
    const root = ref.current?.closest(".sf") as HTMLElement | null;
    if (!root || off || !ok) return;
    const secs = [...root.querySelectorAll<HTMLElement>(".sf-sec")];
    root.dataset.reveal = "on";
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = "1"; io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    secs.forEach((s) => io.observe(s));
    return () => { io.disconnect(); delete root.dataset.reveal; secs.forEach((s) => delete s.dataset.in); };
  }, [off, ok]);
  return <span ref={ref} hidden />;
}

/** Records one real page view. Search-engine prefetches and server renders never reach this. */
export function TrackVisit({ storefrontId }: { storefrontId: string }) {
  useEffect(() => { beacon(storefrontId, "visit"); }, [storefrontId]);
  return null;
}

export function ItemLink({ href, storefrontId, className, children, label }: { href: string; storefrontId: string; className?: string; children: ReactNode; label?: string }) {
  return <Link href={href} className={className} aria-label={label} onClick={() => beacon(storefrontId, "click")}>{children}</Link>;
}

/** Adds one of a product to the existing marketplace cart. */
export function QuickAdd({ listingId, disabled, small }: { listingId: string; disabled?: boolean; small?: boolean }) {
  const [pending, start] = useTransition(); const [done, setDone] = useState(false);
  const router = useRouter(); const path = usePathname();
  return (
    <button type="button" className={`sf-btn ${small ? "sm" : ""}`} disabled={disabled || pending}
      onClick={() => start(async () => {
        const r = await addToCart({}, fd({ listing_id: listingId, quantity: "1", back: path }));
        if (r.error) toast(r.error, "error");
        else { toast("Added to cart."); setDone(true); setTimeout(() => setDone(false), 1400); router.refresh(); }
      })}>
      {done ? <Check size={15} aria-hidden /> : <ShoppingBag size={15} aria-hidden />}{disabled ? "Sold out" : done ? "Added" : "Add to cart"}
    </button>
  );
}

export function Follow({ storefrontId, initial }: { storefrontId: string; initial: boolean }) {
  const [on, set] = useState(initial); const [, start] = useTransition(); const path = usePathname();
  return (
    <button type="button" className="sf-btn ghost" aria-pressed={on}
      onClick={() => { set(!on); start(async () => { const r = await toggleFavourite({}, fd({ storefront_id: storefrontId, back: path })); if (r.error) { set(on); toast(r.error, "error"); } }); }}>
      <Heart size={15} aria-hidden fill={on ? "currentColor" : "none"} />{on ? "Following" : "Follow"}
    </button>
  );
}

export function ShareStore() {
  return (
    <button type="button" className="sf-btn ghost" onClick={async () => {
      if (navigator.share) await navigator.share({ url: location.href }).catch(() => {});
      else { await navigator.clipboard.writeText(location.href); toast("Link copied."); }
    }}>Share</button>
  );
}

/**
 * The banner. Videos are always muted and looped with a poster, pause when off screen, and are swapped
 * for the poster when the visitor prefers reduced motion or the plan no longer covers animated banners.
 */
export function HeroMedia({ kind, url, poster, still, parallax, alt }: { kind: "image" | "gif" | "video" | null; url: string | null; poster: string | null; still: boolean; parallax: boolean; alt: string }) {
  const ok = useMotionOk(); const wrap = useRef<HTMLDivElement>(null); const video = useRef<HTMLVideoElement>(null);
  const animated = kind === "gif" || kind === "video";
  const showStill = animated && (still || !ok);
  useOnScreen(wrap, (v) => { const el = video.current; if (!el) return; if (v) el.play().catch(() => {}); else el.pause(); });
  useEffect(() => {
    if (!parallax || !ok) return;
    const el = wrap.current; if (!el) return;
    let raf = 0;
    const move = () => { raf = 0; const r = el.parentElement!.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) el.style.transform = `translate3d(0, ${Math.round(-r.top * .25)}px, 0) scale(1.12)`; };
    const on = () => { if (!raf) raf = requestAnimationFrame(move); };
    move(); addEventListener("scroll", on, { passive: true });
    return () => { removeEventListener("scroll", on); cancelAnimationFrame(raf); el.style.transform = ""; };
  }, [parallax, ok]);
  const src = showStill ? poster : url;
  return (
    <div ref={wrap} className="sf-media-inner" data-banner={showStill ? "still" : kind ?? "none"}>
      {!src ? null : kind === "video" && !showStill
        ? <video ref={video} src={src} poster={poster ?? undefined} muted loop autoPlay playsInline preload="metadata" aria-label={alt} disablePictureInPicture />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={src} alt={alt} fetchPriority="high" />}
    </div>
  );
}
