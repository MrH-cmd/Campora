"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { Logo } from "./ui";

export function DashShell({ title, links, children }: { title: string; links: [string, string][]; children: ReactNode }) {
  const path = usePathname();
  const isOn = (h: string) => (links.some(([x]) => x !== h && x.startsWith(h) && path.startsWith(x)) ? false : h.split("/").length === 2 ? path === h : path.startsWith(h));
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[230px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-panel text-white md:border-b-0 md:border-r md:h-dvh md:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <Link href="/" aria-label="Back to Vybe Market"><Logo light /></Link>
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
        <div className="hidden gap-1 px-3 pb-4 md:flex md:flex-col">
          <Link href="/" className="rounded-lg px-3 py-2 text-sm text-white/65 hover:text-white">Back to marketplace</Link>
          <Link href="/notifications" className="rounded-lg px-3 py-2 text-sm text-white/65 hover:text-white">Notifications</Link>
          <form action={logout}><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/65 hover:text-white">Log out</button></form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  );
}
