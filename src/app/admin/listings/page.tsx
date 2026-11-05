import Link from "next/link";
import { moderateListing } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { Badge, Empty, Img, PageHead, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { LISTING_STATUS_LABEL, naira } from "@/lib/format";

export const metadata = { title: "Listings" };
export default async function L({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "pending_review" } = await searchParams;
  const a = await requireAdmin();
  const rows = await asUser(a.id, (db) => db.rows("select * from listing_cards where status::text=$1 order by created_at desc limit 100", [status]));
  return (
    <>
      <PageHead title="Listings" />
      <div className="mb-4 flex gap-1 overflow-x-auto">{Object.entries(LISTING_STATUS_LABEL).map(([k, l]) => <Link key={k} href={`/admin/listings?status=${k}`} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${status === k ? "bg-panel text-white" : "border border-line bg-card"}`}>{l}</Link>)}</div>
      {rows.length === 0 ? <Empty title="Nothing here" /> : (
        <Table head={["Listing", "Store", "Price", "Status", "Actions"]}>
          {rows.map((l) => (
            <tr key={l.id}>
              <Td><Link href={`/listing/${l.slug}`} className="flex items-center gap-2 font-medium"><Img path={l.cover} alt="" className="size-10 rounded-lg" /><span className="line-clamp-1">{l.title}</span></Link></Td>
              <Td>{l.store_name}</Td><Td>{naira(l.price_kobo)}</Td><Td><Badge tone={statusTone(l.status)}>{LISTING_STATUS_LABEL[l.status]}</Badge></Td>
              <Td><div className="flex gap-1">
                {l.status !== "active" && <ActionButton action={moderateListing} values={{ id: l.id, decision: "approve" }} variant="primary">Approve</ActionButton>}
                {l.status === "pending_review" && <ActionButton action={moderateListing} values={{ id: l.id, decision: "reject" }}>Reject</ActionButton>}
                {l.status !== "removed" && <ActionButton action={moderateListing} values={{ id: l.id, decision: "remove" }} variant="danger" confirm="Remove this listing from Vybe Market?">Remove</ActionButton>}
              </div></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
