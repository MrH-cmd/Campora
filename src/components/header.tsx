"use client";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Gift, Heart, Home, LayoutGrid, LogOut, Menu, MessageCircle, Package, Search, Shield, ShoppingBag, Store, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Logo, LinkButton } from "./ui";

type U = { name: string; role: string } | null;

const NAV = [{ href: "/search?type=product", label: "Products", key: "product" }, { href: "/search?type=service", label: "Services", key: "service" }, { href: "/search?type=store", label: "Businesses", key: "store" }, { href: "/pricing", label: "Sell on Vybe", key: "sell" }];

function Dot({ n }: { n: number }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} key={n}
          className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-coral px-1 text-[11px] font-bold text-white">{n > 9 ? "9+" : n}</motion.span>
      )}
    </AnimatePresence>
  );
}

export function Header({ user, cart, unread: initial }: { user: U; cart: number; unread: number }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initial);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setMenu(false), [path]);
  useEffect(() => setUnread(initial), [initial]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetch("/api/notifications").catch(() => null);
      if (r?.ok) setUnread((await r.json()).unread);
    }, 20000);
    return () => clearInterval(t);
  }, [user]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, []);

  const search = (e: React.FormEvent) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`); };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <button className="md:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Menu aria-hidden /></button>
          <Link href="/" aria-label="Vybe Market home"><Logo /></Link>
          <nav className="ml-4 hidden items-center lg:flex" aria-label="Main">
            {NAV.map((n) => {
              const active = n.key === "sell" ? path === "/pricing" : false;
              return (
                <Link key={n.href} href={n.href} className="relative px-3 py-2 text-[15px] font-medium text-ink-3 hover:text-ink">
                  {n.label}
                  {active && <motion.span layoutId="nav-ind" className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-palm" />}
                </Link>
              );
            })}
          </nav>
          <form onSubmit={search} role="search" className="ml-auto hidden max-w-xs flex-1 md:block">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3 focus-within:border-palm">
              <Search size={16} className="text-mute" aria-hidden />
              <span className="sr-only">Search Vybe Market</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Vybe Market" className="w-full bg-transparent text-sm outline-none" />
            </label>
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {user ? (
              <>
                <Link href="/notifications" aria-label={`Notifications, ${unread} unread`} className="relative grid size-10 place-items-center rounded-xl hover:bg-ink/5"><Bell size={20} aria-hidden /><Dot n={unread} /></Link>
                <Link href="/cart" aria-label={`Cart, ${cart} items`} className="relative grid size-10 place-items-center rounded-xl hover:bg-ink/5"><ShoppingBag size={20} aria-hidden /><Dot n={cart} /></Link>
                <div className="relative hidden md:block" ref={box}>
                  <button aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className="ml-1 grid size-10 place-items-center rounded-full bg-palm text-sm font-bold text-white">
                    {user.name[0]?.toUpperCase()}<span className="sr-only">Account menu</span>
                  </button>
                  <AnimatePresence>
                    {open && (
                      <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .14 }}
                        className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-line bg-panel-2 p-1.5 shadow-xl" onClick={() => setOpen(false)}>
                        <MenuItems role={user.role} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="hidden px-3 text-[15px] font-medium sm:block">Log in</Link>
                <LinkButton href="/register" size="sm">Join Vybe Market</LinkButton>
              </>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 bg-ink/50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)}>
            <motion.div role="dialog" aria-label="Menu" className="h-full w-[82%] max-w-xs overflow-y-auto bg-panel-2 p-4" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><Logo /><button aria-label="Close menu" onClick={() => setMenu(false)}><X aria-hidden /></button></div>
              <form onSubmit={search} role="search" className="mb-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Vybe Market" aria-label="Search Vybe Market" className="input" /></form>
              {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-3 font-medium hover:bg-ink/5">{n.label}</Link>)}
              <hr className="my-2 border-line" />
              {user ? <MenuItems role={user.role} /> : <Link href="/login" className="block px-3 py-3 font-medium">Log in</Link>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
        {[{ h: "/", l: "Home", I: Home }, { h: "/search", l: "Browse", I: LayoutGrid }, { h: "/messages", l: "Messages", I: MessageCircle }, { h: "/account/orders", l: "Orders", I: Package }, { h: "/account", l: "Me", I: User }].map(({ h, l, I }) => {
          const on = h === "/" ? path === "/" : path.startsWith(h);
          return (
            <Link key={h} href={h} aria-current={on ? "page" : undefined} className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-semibold text-palm-deep" : "text-mute"}`}>
              {on && <motion.span layoutId="tab-ind" className="absolute inset-x-5 top-0 h-0.5 rounded bg-palm" />}
              <I size={20} aria-hidden />{l}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function MenuItems({ role }: { role: string }) {
  const cls = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] hover:bg-ink/5";
  return (
    <>
      {role === "admin" && <Link role="menuitem" className={cls} href="/admin"><Shield size={17} aria-hidden />Admin</Link>}
      {role === "seller" || role === "admin" ? <Link role="menuitem" className={cls} href="/seller"><Store size={17} aria-hidden />Seller dashboard</Link>
        : role === "customer" && <Link role="menuitem" className={cls} href="/account/become-seller"><Store size={17} aria-hidden />Start selling</Link>}
      <Link role="menuitem" className={cls} href="/account"><User size={17} aria-hidden />Account</Link>
      <Link role="menuitem" className={cls} href="/account/orders"><Package size={17} aria-hidden />Orders</Link>
      <Link role="menuitem" className={cls} href="/account/rewards"><Gift size={17} aria-hidden />My Rewards</Link>
      <Link role="menuitem" className={cls} href="/messages"><MessageCircle size={17} aria-hidden />Messages</Link>
      <Link role="menuitem" className={cls} href="/account/favourites"><Heart size={17} aria-hidden />Favourites</Link>
      <form action={logout}><button role="menuitem" className={cls}><LogOut size={17} aria-hidden />Log out</button></form>
    </>
  );
}
