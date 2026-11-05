"use client";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Minus, Plus, Trash2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addToCart, setCartQuantity, toggleFavourite } from "@/app/actions/shop";
import { buttonClass } from "./ui";
import { toast } from "./toast";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

export function FavButton({ listingId, storefrontId, initial }: { listingId?: string; storefrontId?: string; initial: boolean }) {
  const [on, set] = useState(initial);
  const [, start] = useTransition();
  const path = usePathname();
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Remove from favourites" : "Save to favourites"}
      className="grid size-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110"
      onClick={() => {
        set(!on);
        start(async () => {
          const r = await toggleFavourite({}, fd({ ...(listingId ? { listing_id: listingId } : { storefront_id: storefrontId! }), back: path }));
          if (r.error) { set(on); toast(r.error, "error"); }
        });
      }}>
      <motion.span animate={{ scale: on ? [1, 1.35, 1] : 1 }} transition={{ duration: .3 }} className="grid">
        <Heart size={17} className={on ? "fill-coral text-coral" : "text-ink-3"} aria-hidden />
      </motion.span>
    </button>
  );
}

export function AddToCart({ listingId, disabled, label = "Add to cart", max = 50 }: { listingId: string; disabled?: boolean; label?: string; max?: number }) {
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState(false);
  const router = useRouter(); const path = usePathname();
  return (
    <div className="flex gap-2">
      <div className="flex items-center rounded-xl border border-line bg-white">
        <button type="button" aria-label="Fewer" className="grid size-12 place-items-center" onClick={() => setQty(Math.max(1, qty - 1))}><Minus size={16} aria-hidden /></button>
        <span className="w-6 text-center tabular-nums" aria-live="polite">{qty}</span>
        <button type="button" aria-label="More" className="grid size-12 place-items-center" onClick={() => setQty(Math.min(max, qty + 1))}><Plus size={16} aria-hidden /></button>
      </div>
      <button type="button" disabled={disabled || pending} className={`${buttonClass("primary", "lg")} relative flex-1 overflow-hidden`}
        onClick={() => start(async () => {
          const r = await addToCart({}, fd({ listing_id: listingId, quantity: String(qty), back: path }));
          if (r.error) toast(r.error, "error");
          else { toast("Added to cart."); setFlash(true); setTimeout(() => setFlash(false), 700); router.refresh(); }
        })}>
        <AnimatePresence mode="wait">
          <motion.span key={flash ? "a" : "b"} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: .15 }}>
            {flash ? "Added" : label}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}

export function CartQty({ listingId, quantity }: { listingId: string; quantity: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (q: number) => start(async () => {
    const r = await setCartQuantity({}, fd({ listing_id: listingId, quantity: String(q) }));
    if (r.error) toast(r.error, "error");
    router.refresh();
  });
  return (
    <div className={`flex items-center gap-1 ${pending ? "opacity-50" : ""}`}>
      <button type="button" aria-label="Fewer" className="grid size-9 place-items-center rounded-lg border border-line" onClick={() => set(quantity - 1)}><Minus size={14} aria-hidden /></button>
      <span className="w-6 text-center tabular-nums">{quantity}</span>
      <button type="button" aria-label="More" className="grid size-9 place-items-center rounded-lg border border-line" onClick={() => set(quantity + 1)}><Plus size={14} aria-hidden /></button>
      <button type="button" aria-label="Remove" className="ml-1 grid size-9 place-items-center rounded-lg text-mute hover:text-coral" onClick={() => set(0)}><Trash2 size={16} aria-hidden /></button>
    </div>
  );
}

export function Gallery({ images, title }: { images: { path: string }[]; title: string }) {
  const [i, set] = useState(0);
  const touch = useRef(0);
  if (!images.length) return <div className="grid aspect-square place-items-center rounded-tag bg-mint-soft text-palm-deep">No photos yet</div>;
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-tag bg-mint-soft"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) set((i + (dx < 0 ? 1 : -1) + images.length) % images.length); }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img key={images[i].path} src={`/files/${images[i].path}`} alt={`${title}, photo ${i + 1}`} className="size-full object-cover"
            initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .25 }} />
        </AnimatePresence>
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {images.map((m, n) => (
            <button key={m.path} type="button" onClick={() => set(n)} aria-label={`Show photo ${n + 1}`} aria-current={n === i}
              className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${n === i ? "border-palm" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/files/${m.path}`} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
