import Link from "next/link";
import { CartQty } from "@/components/shop-client";
import { Empty, Img, LinkButton, Price } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira } from "@/lib/format";

export const metadata = { title: "Cart" };

export default async function Cart() {
  const u = await requireUser("/cart");
  const items = await asUser(u.id, (db) => db.rows(
    `select c.quantity, l.* from cart_items c join listing_cards l on l.id=c.listing_id where c.user_id=$1 order by l.store_name, c.created_at`, [u.id]));
  const total = items.reduce((s, i) => s + Number(i.effective_price_kobo) * i.quantity, 0);
  const stores = [...new Set(items.map((i) => i.store_name))];
  const problem = items.some((i) => i.status !== "active" || !i.in_stock || (i.kind === "product" && i.quantity > i.stock));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-5 text-3xl font-bold">Your cart</h1>
      {items.length === 0 ? <Empty title="Your cart is empty" body="Find something good from students on campus." action={<LinkButton href="/search">Browse Campora</LinkButton>} /> : (
        <>
          {stores.map((name) => (
            <section key={name} className="mb-4 rounded-tag border border-line bg-white p-4">
              <h2 className="mb-2 font-sans text-sm font-semibold tracking-normal text-mute">{name}</h2>
              <ul className="divide-y divide-line">
                {items.filter((i) => i.store_name === name).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-3">
                    <Img path={i.cover} alt="" className="size-16 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/listing/${i.slug}`} className="line-clamp-1 font-medium">{i.title}</Link>
                      <Price kobo={i.effective_price_kobo} was={i.price_kobo} className="text-sm" />
                      {(i.status !== "active" || !i.in_stock) && <p className="text-xs text-coral">No longer available. Remove it to check out.</p>}
                      {i.kind === "product" && i.in_stock && i.quantity > i.stock && <p className="text-xs text-coral">Only {i.stock} left.</p>}
                    </div>
                    <CartQty listingId={i.id} quantity={i.quantity} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="flex items-center justify-between rounded-tag bg-ink p-4 text-white">
            <p><span className="text-white/70">Total </span><span className="display text-2xl font-bold tabular-nums">{naira(total)}</span></p>
            {problem ? <span className="text-sm">Fix the items above</span> : <LinkButton href="/checkout">Check out</LinkButton>}
          </div>
          {stores.length > 1 && <p className="mt-2 text-sm text-mute">You'll get one order for each of the {stores.length} sellers.</p>}
        </>
      )}
    </div>
  );
}
