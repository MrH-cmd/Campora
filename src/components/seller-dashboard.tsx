"use client";
import { AnimatePresence, Reorder, motion } from "motion/react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDashboard } from "@/app/actions/seller";
import { WIDGETS } from "@/lib/widgets";
import { buttonClass } from "./ui";
import { toast } from "./toast";

export function DashboardCustomizer({ layout }: { layout: string[] }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(layout);
  const [pending, start] = useTransition();
  const router = useRouter();
  const off = WIDGETS.filter((w) => !on.includes(w.id));
  const label = (id: string) => WIDGETS.find((w) => w.id === id)?.label ?? id;
  const move = (i: number, by: number) => { const n = [...on]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); setOn(n); };
  const save = () => start(async () => {
    const f = new FormData(); f.set("layout", on.join(","));
    const r = await saveDashboard({}, f);
    if (r.error) toast(r.error, "error"); else { toast("Dashboard saved."); setOpen(false); router.refresh(); }
  });
  return (
    <div className="w-full">
      <div className="flex justify-end"><button type="button" aria-expanded={open} className={buttonClass("outline", "sm")} onClick={() => setOpen(!open)}><SlidersHorizontal size={15} aria-hidden />Customize</button></div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-tag border border-line bg-card p-4">
              <p className="text-sm text-mute">Choose what you see, and put it in your own order.</p>
              <Reorder.Group axis="y" values={on} onReorder={setOn} className="mt-2 space-y-1.5">
                {on.map((id, i) => (
                  <Reorder.Item key={id} value={id} className="flex cursor-grab items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 active:cursor-grabbing">
                    <input type="checkbox" checked aria-label={`Show ${label(id)}`} className="size-4 accent-palm" onChange={() => setOn(on.filter((x) => x !== id))} />
                    <span className="flex-1 text-sm">{label(id)}</span>
                    <button type="button" aria-label={`Move ${label(id)} up`} disabled={i === 0} className="p-1 disabled:opacity-30" onClick={() => move(i, -1)}><ChevronUp size={16} aria-hidden /></button>
                    <button type="button" aria-label={`Move ${label(id)} down`} disabled={i === on.length - 1} className="p-1 disabled:opacity-30" onClick={() => move(i, 1)}><ChevronDown size={16} aria-hidden /></button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
              {off.length > 0 && <div className="mt-2 space-y-1">{off.map((w) => (
                <label key={w.id} className="flex items-center gap-2 px-3 py-1 text-sm text-mute"><input type="checkbox" checked={false} className="size-4 accent-palm" onChange={() => setOn([...on, w.id])} />{w.label}</label>
              ))}</div>}
              <button type="button" disabled={pending} onClick={save} className={`${buttonClass("primary", "sm")} mt-3`}>Save dashboard</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
