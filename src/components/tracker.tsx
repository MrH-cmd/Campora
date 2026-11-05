"use client";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { dateTime, shortDate } from "@/lib/format";
import { buttonClass } from "./ui";
import { toast } from "./toast";

type T = { stage: string | null; expected: string | null; appointment: string | null; updates: { id: string; stage: string; note: string | null; created_at: string }[]; location: { latitude: string; longitude: string; updated_at: string } | null };

/** Refreshes from the database every few seconds, so closing the page loses nothing. */
export function ServiceTracker({ orderId, initial }: { orderId: string; initial: T }) {
  const [t, set] = useState(initial);
  useEffect(() => {
    const i = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/orders/${orderId}/tracker`).catch(() => null);
      if (r?.ok) set(await r.json());
    }, 5000);
    return () => clearInterval(i);
  }, [orderId]);
  const last = t.updates[t.updates.length - 1];
  return (
    <div>
      <h2 className="font-bold">Track your service</h2>
      <p className="mt-1 text-lg font-semibold text-palm-deep">{t.stage ?? "Order received"}</p>
      {last && <p className="text-xs text-mute">Last update {dateTime(last.created_at)}</p>}
      {t.expected && <p className="mt-1 text-sm">Expected by {shortDate(t.expected)}</p>}
      {t.appointment && <p className="text-sm">Appointment: {t.appointment}</p>}
      {t.location && <p className="mt-2 rounded-lg bg-mint-soft px-3 py-2 text-sm">The seller is sharing their location. <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${t.location.latitude},${t.location.longitude}`}>Open map</a></p>}
      <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
        {t.updates.map((u) => (
          <motion.li key={u.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-sm">
            <p className="font-medium">{u.stage}</p>{u.note && <p className="text-ink-3">{u.note}</p>}<p className="text-xs text-mute">{dateTime(u.created_at)}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** Location only flows while this page is open and the seller has switched it on. */
export function LocationShare({ orderId, active }: { orderId: string; active: boolean }) {
  const [on, setOn] = useState(false);
  const watch = useRef<number | null>(null);
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  const stop = async () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; setOn(false);
    await fetch(`/api/orders/${orderId}/location`, { method: "DELETE" });
  };
  const start = () => {
    watch.current = navigator.geolocation.watchPosition(
      (p) => { setOn(true); fetch(`/api/orders/${orderId}/location`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: p.coords.latitude, longitude: p.coords.longitude }) }); },
      () => toast("Location wasn't shared. Check your browser permission.", "error"), { maximumAge: 30000 });
  };
  if (!active) return null;
  return (
    <div className="mt-3 rounded-xl bg-panel-2 p-3 text-sm">
      <p>Optional: share your location while you travel to this customer. It's visible only to them and stops when you stop it, leave this page or close the order.</p>
      <button type="button" className={`${buttonClass("outline", "sm")} mt-2`} onClick={on ? stop : start}>{on ? "Stop sharing location" : "Share my location"}</button>
    </div>
  );
}
