"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { reply } from "@/app/actions/shop";
import { Form, Submit } from "./form";
import { timeAgo } from "@/lib/format";

type M = { id: string; body: string; sender_id: string; created_at: string; listing_title?: string; listing_slug?: string; order_number?: string };

export function Chat({ id, me, initial }: { id: string; me: string; initial: M[] }) {
  const [msgs, set] = useState(initial);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => set(initial), [initial]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch(`/api/messages/${id}`).catch(() => null);
      if (r?.ok) set((await r.json()).messages);
    }, 4000);
    return () => clearInterval(t);
  }, [id]);
  return (
    <div className="mt-4">
      <div className="space-y-2 rounded-tag border border-line bg-card p-3 sm:p-4" role="log" aria-label="Messages">
        {msgs.map((m) => {
          const mine = m.sender_id === me;
          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? "justify-end" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${mine ? "bg-palm text-white" : "bg-panel-2"}`}>
                {m.listing_slug && <Link href={`/listing/${m.listing_slug}`} className="mb-0.5 block text-xs underline opacity-75">About: {m.listing_title}</Link>}
                {m.order_number && <p className="mb-0.5 text-xs opacity-75">Order {m.order_number}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-0.5 text-[11px] opacity-60">{timeAgo(m.created_at)}</p>
              </div>
            </motion.div>
          );
        })}
        <div ref={end} />
      </div>
      <Form action={reply} resetOnSuccess className="mt-3">
        <input type="hidden" name="conversation_id" value={id} />
        <div className="flex gap-2"><input name="body" aria-label="Your message" placeholder="Write a message" className="input" autoComplete="off" /><Submit>Send</Submit></div>
      </Form>
    </div>
  );
}
