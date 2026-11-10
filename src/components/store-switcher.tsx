"use client";
import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchStore } from "@/app/actions/seller";
import { toast } from "@/components/toast";

type S = { id: string; name: string; live: boolean };
/** Picks which storefront the seller dashboard works on. */
export function StoreSwitcher({ stores, current, limit }: { stores: S[]; current: string | null; limit: number }) {
  const router = useRouter(); const [busy, start] = useTransition();
  if (!stores.length) return null;
  const change = (id: string) => start(async () => {
    const f = new FormData(); f.set("storefront_id", id);
    const r = await switchStore({}, f);
    if (r.error) toast(r.error, "error"); else { toast(`Now working on ${stores.find((s) => s.id === id)?.name ?? "that store"}`); router.refresh(); }
  });
  return (
    <div className="px-3 pb-2 md:pb-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/50">Storefront {stores.length}/{limit}
        <span className="relative mt-1 flex items-center">
          <select aria-label="Storefront you're working on" value={current ?? ""} disabled={busy} onChange={(e) => change(e.target.value)}
            className="w-full appearance-none truncate rounded-lg border border-white/15 bg-white/8 py-2 pl-3 pr-8 text-sm font-semibold normal-case tracking-normal text-white">
            {stores.map((s) => <option key={s.id} value={s.id} className="text-black">{s.name}{s.live ? "" : " (paused)"}</option>)}
          </select>
          <ChevronsUpDown size={15} className="pointer-events-none absolute right-2.5 text-white/60" aria-hidden />
        </span>
      </label>
      {stores.length < limit && <Link href="/seller/storefront/stores" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white"><Plus size={13} aria-hidden />Open another storefront</Link>}
    </div>
  );
}
