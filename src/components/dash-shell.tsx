"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./ui";

export function DashShell({ title, links, children }: { title: string; links: [string, string][]; children: ReactNode }) {
  const path = usePathname();
  const isOn = (h: string) => (links.some(([x]) => x !== h && x.startsWith(h) && path.startsWith(x)) ? false : h.split("/").length === 2 ? path === h : path.startsWith(h));
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[230px_1fr]">
      <aside className="sticky top-0 z-30 bg-ink text-white md:h-dvh md:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <Link href="/" aria-label="Back to Campora"><Logo light /></Link>
          <p className="text-sm text-white/60 md:mt-1">{title}</p>
        </div>
        <nav aria-label={title} className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:pb-4">
          {links.map(([h, l]) => {
            const on = isOn(h);
            return (
              <Link key={h} href={h} aria-current={on ? "page" : undefined} className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${on ? "text-white" : "text-white/65 hover:text-white"}`}>
                {on && <motion.span layoutId="dash-ind" className="absolute inset-0 rounded-lg bg-white/12" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className="relative">{l}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  );
}
