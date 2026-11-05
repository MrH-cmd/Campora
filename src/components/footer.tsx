import Link from "next/link";
import { Logo } from "./ui";

export function Footer() {
  return (
    <footer className="mt-20 bg-panel pb-24 pt-12 text-white/70 md:pb-12">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-8 px-4">
        <div className="max-w-xs"><Logo light /><p className="mt-3 text-sm">All your campus needs, in one app. Starting at Covenant University.</p></div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          <Link className="hover:text-white" href="/search?type=product">Products</Link>
          <Link className="hover:text-white" href="/pricing">Seller plans</Link>
          <Link className="hover:text-white" href="/search?type=service">Services</Link>
          <Link className="hover:text-white" href="/account/become-seller">Start selling</Link>
          <Link className="hover:text-white" href="/search?type=store">Businesses</Link>
          <Link className="hover:text-white" href="/account">Your account</Link>
        </nav>
      </div>
    </footer>
  );
}
