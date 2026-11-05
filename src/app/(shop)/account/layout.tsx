import Link from "next/link";
import { requireUser } from "@/lib/auth";

const LINKS = [["/account", "Profile"], ["/account/orders", "Orders"], ["/account/rewards", "My Rewards"], ["/account/favourites", "Favourites"], ["/account/verification", "Student verification"], ["/messages", "Messages"]];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/account");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav aria-label="Account" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4">
        {LINKS.map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-3 hover:bg-ink/5">{l}</Link>)}
      </nav>
      {children}
    </div>
  );
}
