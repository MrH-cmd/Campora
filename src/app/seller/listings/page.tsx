import Link from "next/link";
import { setListingActive, sellerContext } from "@/app/actions/seller";
import { ActionButton } from "@/components/form";
import { Badge, Empty, Img, LinkButton, PageHead, statusTone, Table, Td } from "@/components/ui";
import { asUser } from "@/lib/db";
import { LISTING_STATUS_LABEL, naira } from "@/lib/format";

export const metadata = { title: "Listings" };
export default async function Listings() {
  const { user, store, plan } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" action={<LinkButton href="/seller/storefront">Set up storefront</LinkButton>} />;
  const rows = await asUser(user.id, (db) => db.rows("select * from listing_cards where storefront_id=$1 order by created_at desc", [store.id]));
  const used = rows.filter((r) => ["active", "pending_review"].includes(r.status)).length;
  return (
    <>
      <PageHead title="Listings" sub={`${used} of ${plan.listing_limit} active on ${plan.name}`} action={<LinkButton href="/seller/listings/new">Add a listing</LinkButton>} />
      {rows.length === 0 ? <Empty title="List your first product or service" action={<LinkButton href="/seller/listings/new">Add a listing</LinkButton>} /> : (
        <Table head={["Listing", "Type", "Price", "Stock", "Status", ""]}>
          {rows.map((l) => (
            <tr key={l.id}>
              <Td><Link href={`/seller/listings/${l.id}`} className="flex items-center gap-2 font-medium hover:text-palm-deep"><Img path={l.cover} alt="" className="size-10 rounded-lg" /><span className="line-clamp-1">{l.title}</span></Link></Td>
              <Td className="capitalize">{l.kind}</Td><Td className="tabular-nums">{naira(l.effective_price_kobo)}</Td>
              <Td>{l.kind === "product" ? l.stock : "n/a"}</Td>
              <Td><Badge tone={statusTone(l.status)}>{LISTING_STATUS_LABEL[l.status]}</Badge></Td>
              <Td>{["active", "pending_review"].includes(l.status)
                ? <ActionButton action={setListingActive} values={{ id: l.id, active: "0" }}>Deactivate</ActionButton>
                : ["inactive", "draft"].includes(l.status) && <ActionButton action={setListingActive} values={{ id: l.id, active: "1" }}>Activate</ActionButton>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
