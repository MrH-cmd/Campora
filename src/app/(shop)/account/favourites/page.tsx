import Link from "next/link";
import { CardGrid, ListingCard } from "@/components/listing-card";
import { Empty, Img, LinkButton, PageHead } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Favourites" };
export default async function Favs() {
  const u = await requireUser("/account/favourites");
  const d = await asUser(u.id, async (db) => ({
    items: await db.rows("select l.* from favourites f join listing_cards l on l.id=f.listing_id where f.user_id=$1 and l.status='active' order by f.created_at desc", [u.id]),
    stores: await db.rows("select s.* from favourites f join storefronts s on s.id=f.storefront_id where f.user_id=$1", [u.id]),
  }));
  return (
    <>
      <PageHead title="Favourites" />
      {!d.items.length && !d.stores.length && <Empty title="Nothing saved yet" body="Tap the heart on anything you want to find again." action={<LinkButton href="/search">Browse Vybe Market</LinkButton>} />}
      {d.stores.length > 0 && <div className="mb-6 flex flex-wrap gap-2">{d.stores.map((s) => <Link key={s.id} href={`/store/${s.slug}`} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 font-medium"><Img path={s.logo_path} alt="" className="size-8 rounded-full" />{s.name}</Link>)}</div>}
      <CardGrid>{d.items.map((l) => <ListingCard key={l.id} l={l} faved />)}</CardGrid>
    </>
  );
}
