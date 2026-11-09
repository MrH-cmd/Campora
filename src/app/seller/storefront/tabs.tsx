import Link from "next/link";

const TABS: [string, string][] = [["", "Overview"], ["/designs", "Designs"], ["/editor", "Editor"], ["/media", "Banners and media"], ["/analytics", "Analytics"]];
export function StoreTabs({ on }: { on: string }) {
  return (
    <nav aria-label="My Storefront" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map(([h, l]) => (
        <Link key={h} href={`/seller/storefront${h}`} aria-current={on === h ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${on === h ? "border-palm text-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}</Link>
      ))}
    </nav>
  );
}
