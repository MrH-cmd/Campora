import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { fileUrl, naira } from "@/lib/format";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`display inline-flex items-center gap-2 text-xl font-bold ${light ? "text-white" : "text-ink"}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <defs><linearGradient id="vy" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a855f7" /><stop offset="1" stopColor="#6d28d9" /></linearGradient></defs>
        <path d="M6 3h20a3 3 0 0 1 3 3v6a4 4 0 0 0 0 8v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a4 4 0 0 0 0-8V6a3 3 0 0 1 3-3Z" fill="url(#vy)" />
        <path d="m10 10 6 12 6-12" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Vybe Market
    </span>
  );
}

const btn = {
  primary: "shine bg-palm text-white hover:bg-palm-hover shadow-[0_8px_24px_-10px_#7c3aed]",
  dark: "border border-line bg-panel-2 text-white hover:border-palm",
  outline: "border border-line bg-card text-ink hover:border-ink-3",
  ghost: "text-ink-3 hover:bg-ink/5",
  danger: "bg-card text-coral border border-coral/40 hover:bg-coral hover:text-white",
};
export const buttonClass = (v: keyof typeof btn = "primary", size: "sm" | "md" | "lg" = "md") =>
  `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none ${btn[v]} ${
    size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-13 px-6 text-base" : "h-11 px-4 text-[15px]"}`;

export function LinkButton({ variant, size, className = "", ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof btn; size?: "sm" | "md" | "lg" }) {
  return <Link {...p} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function Price({ kobo, was, from, className = "" }: { kobo: number | string; was?: number | string | null; from?: boolean; className?: string }) {
  const reduced = was != null && Number(was) > Number(kobo);
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      {from && <span className="text-xs font-medium text-mute">from</span>}
      <span className="font-semibold tabular-nums">{naira(kobo)}</span>
      {reduced && <s className="text-xs text-mute tabular-nums">{naira(was)}</s>}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "ink" }) {
  const t = { neutral: "bg-ink/6 text-ink-3", green: "bg-mint text-palm-deep", amber: "bg-sun/15 text-sun", red: "bg-coral/12 text-coral", ink: "bg-panel text-white" }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

export const statusTone = (s: string): "neutral" | "green" | "amber" | "red" =>
  ["completed", "active", "approved", "verified", "paid", "collected", "success", "resolved", "processed", "confirmed", "reward_issued", "successful", "resolved_buyer", "resolved_seller"].includes(s) ? "green"
  : ["cancelled", "rejected", "removed", "failed", "suspended", "dismissed", "refunded", "expired"].includes(s) ? "red"
  : ["pending", "pending_review", "requested", "processing", "needs_info", "resubmit", "review", "pending_purchase", "awaiting_completion", "reserved", "scheduled", "open", "restricted", "awaiting_payment", "initiated", "pay_on_pickup", "pending_payment"].includes(s) ? "amber" : "neutral";

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-tag border border-dashed border-line bg-card/60 px-6 py-12 text-center">
      <p className="display text-lg font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-mute">{sub}</p>}</div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-tag border border-line bg-card p-4">
      <p className="text-sm text-mute">{label}</p>
      <p className="display mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-mute">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-tag border border-line bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Img({ path, alt, className = "" }: { path?: string | null; alt: string; className?: string }) {
  const url = fileUrl(path);
  if (!url) return <div className={`grid place-items-center bg-mint-soft text-sm text-palm-deep ${className}`} aria-label={alt}>No photo</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-tag border border-line bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-b border-line text-mute">{head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;

export function Pager({ page, hasNext, query }: { page: number; hasNext: boolean; query: Record<string, string | undefined> }) {
  const href = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)) as Record<string, string>, page: String(p) });
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="mt-6 flex justify-center gap-2" aria-label="Pages">
      {page > 1 && <LinkButton variant="outline" href={href(page - 1)}>Previous</LinkButton>}
      {hasNext && <LinkButton variant="outline" href={href(page + 1)}>Next</LinkButton>}
    </nav>
  );
}
