"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type T = { id: number; text: string; tone: "ok" | "error" };
let push: (t: T) => void = () => {};
let n = 0;
export const toast = (text: string, tone: T["tone"] = "ok") => push({ id: ++n, text, tone });

export function Toaster() {
  const [items, set] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => { set((s) => [...s, t]); setTimeout(() => set((s) => s.filter((x) => x.id !== t.id)), 4000); };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, y: 8 }}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${t.tone === "ok" ? "border border-palm bg-panel-2 text-white" : "bg-coral text-white"}`}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
