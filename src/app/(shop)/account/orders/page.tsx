import Link from "next/link";
import { Badge, Empty, Img, LinkButton, PageHead, Pager, statusTone } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, ORDER_STATUS_LABEL, shortDate } from "@/lib/format";

export const metadata = { title: "Orders" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ placed?: string; page?: string }> }) {
  const u = await requireUser("/account/orders");
  const { placed, page: pg } = await searchParams;
  const page = Math.max(1, Number(pg) || 1);
  const rows = await asUser(u.id, (db) => db.rows(
    `select o.*, s.name store, s.logo_path, (select string_agg(title, ', ') from order_items i where i.order_id=o.id) items
     from orders o join storefronts s on s.id=o.storefront_id where o.buyer_id=$1 order by o.created_at desc limit 21 offset $2`, [u.id, (page - 1) * 20]));
  return (
    <>
      <PageHead title="Your orders" />
      {placed && <p className="mb-4 rounded-xl bg-mint px-4 py-2.5 text-sm font-medium">Order placed. The seller will accept it soon.</p>}
      {rows.length === 0 ? <Empty title="No orders yet" action={<LinkButton href="/search">Browse Vybe Market</LinkButton>} /> : (
        <ul className="space-y-2">
          {rows.slice(0, 20).map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="flex items-center gap-3 rounded-tag border border-line bg-card p-3 hover:border-palm">
                <Img path={o.logo_path} alt="" className="size-12 rounded-xl" />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{o.items}</p><p className="text-sm text-mute">{o.store}, {shortDate(o.created_at)}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums">{naira(o.total_kobo)}</p><Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} hasNext={rows.length > 20} query={{}} />
    </>
  );
}
