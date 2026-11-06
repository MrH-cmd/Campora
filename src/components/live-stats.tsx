"use client";
import { useEffect, useState } from "react";

type C = { online: number; members: number; guests: number; registered: number };

/** Checks in once a minute while the tab is visible, so closed tabs drop off on their own. */
export function PresencePing() {
  useEffect(() => {
    let id: string | null = null;
    try { id = sessionStorage.getItem("vybe-visitor"); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("vybe-visitor", id); } } catch { id = crypto.randomUUID(); }
    const ping = () => { if (!document.hidden) fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), keepalive: true }).catch(() => {}); };
    ping();
    const t = setInterval(ping, 60000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", ping); };
  }, []);
  return null;
}

export function LiveStats({ initial }: { initial: C }) {
  const [c, set] = useState(initial);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch("/api/admin/live").catch(() => null);
      if (r?.ok) set(await r.json());
    }, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mb-3 grid grid-cols-2 gap-3">
      <div className="glow-card rounded-tag border border-palm bg-mint-soft p-4">
        <p className="flex items-center gap-2 text-sm text-mute"><span className="pulse-dot size-2.5 rounded-full bg-[#4ade80]" aria-hidden />Online now</p>
        <p className="display mt-1 text-3xl font-bold tabular-nums" data-testid="online">{c.online}</p>
        <p className="mt-0.5 text-xs text-mute">{c.members} signed in, {c.guests} guest{c.guests === 1 ? "" : "s"}</p>
      </div>
      <div className="glow-card rounded-tag border border-line bg-card p-4">
        <p className="text-sm text-mute">Total registered users</p>
        <p className="display mt-1 text-3xl font-bold tabular-nums" data-testid="registered">{c.registered}</p>
      </div>
    </div>
  );
}

export function PublicLive({ className = "" }: { className?: string }) {
  const [c, set] = useState<{ online: number; registered: number } | null>(null);
  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      const r = await fetch("/api/live").catch(() => null);
      if (r?.ok) set(await r.json());
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-sm ${className}`} aria-live="off">
      <span className="flex items-center gap-2"><span className="pulse-dot size-2.5 rounded-full bg-[#4ade80]" aria-hidden /><b className="tabular-nums" data-testid="public-online">{c?.online.toLocaleString("en-NG") ?? "-"}</b> online now</span>
      <span><b className="tabular-nums" data-testid="public-registered">{c?.registered.toLocaleString("en-NG") ?? "-"}</b> registered users</span>
    </p>
  );
}
