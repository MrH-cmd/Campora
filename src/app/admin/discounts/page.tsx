import Link from "next/link";
import { deleteDiscount, setDiscountStatus } from "@/app/actions/admin";
import { ActionButton } from "@/components/form";
import { Badge, Empty, LinkButton, PageHead, Stat, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { naira, shortDate } from "@/lib/format";

export const metadata = { title: "Discount Management" };
const STATE = `case when status in ('draft','paused','archived') then status when expires_at<=now() then 'expired' when starts_at>now() then 'scheduled' else 'active' end`;
const TABS = [["all", "All"], ["active", "Active"], ["scheduled", "Scheduled"], ["expired", "Expired"], ["paused", "Paused"], ["draft", "Drafts"], ["archived", "Archived"], ["usage", "Usage history"]];

export default async function Discounts({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    s: await db.one(`select count(*)::int total, count(*) filter (where (${STATE})='active')::int active, count(*) filter (where (${STATE})='scheduled')::int scheduled, count(*) filter (where (${STATE})='expired')::int expired from discount_campaigns`),
    r: await db.one(`select count(*)::int n, coalesce(sum(discount_kobo),0) issued, coalesce(sum(discount_kobo) filter (where status='confirmed'),0) redeemed, count(distinct user_id)::int customers from discount_redemptions where status<>'released'`),
    list: tab === "usage" ? [] : await db.rows(`select c.*, (${STATE}) state, (select count(*)::int from discount_redemptions r where r.campaign_id=c.id and r.status<>'released') uses from discount_campaigns c where $1='all' or (${STATE})=$1 order by c.created_at desc`, [tab]),
    usage: tab === "usage" ? await db.rows("select r.*, c.name, o.number, o.id oid, u.full_name from discount_redemptions r join discount_campaigns c on c.id=r.campaign_id join orders o on o.id=r.order_id join users u on u.id=r.user_id order by r.redeemed_at desc limit 200") : [],
  }));
  return (
    <>
      <PageHead title="Discount Management" action={<LinkButton href="/admin/discounts/new">Create discount</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Discounts created" value={d.s.total} /><Stat label="Active now" value={d.s.active} /><Stat label="Scheduled" value={d.s.scheduled} /><Stat label="Expired" value={d.s.expired} />
        <Stat label="Redemptions" value={d.r.n} /><Stat label="Value issued" value={naira(d.r.issued)} /><Stat label="Value redeemed" value={naira(d.r.redeemed)} hint="On paid or confirmed orders" /><Stat label="Customers" value={d.r.customers} />
      </div>
      <div className="my-4 flex gap-1 overflow-x-auto">{TABS.map(([k, l]) => <Link key={k} href={`/admin/discounts?tab=${k}`} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-palm text-white" : "border border-line"}`}>{l}</Link>)}</div>
      {tab === "usage" ? (d.usage.length === 0 ? <Empty title="No redemptions yet" /> : (
        <>
          <a className="mb-2 inline-block text-sm font-semibold text-palm-deep underline" href="/api/admin/export?report=discounts">Export CSV</a>
          <Table head={["Customer", "Discount", "Order", "Amount", "Vybe paid", "Seller paid", "Status", "When"]}>{d.usage.map((r) => <tr key={r.id}><Td>{r.full_name}</Td><Td>{r.name}</Td><Td>{r.number}</Td><Td>{naira(r.discount_kobo)}</Td><Td>{naira(r.platform_funded_kobo)}</Td><Td>{naira(r.seller_funded_kobo)}</Td><Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td><Td>{shortDate(r.redeemed_at)}</Td></tr>)}</Table>
        </>
      )) : d.list.length === 0 ? <Empty title="No discounts here" action={<LinkButton href="/admin/discounts/new">Create discount</LinkButton>} /> : (
        <Table head={["Discount", "Offer", "Uses", "Ends", "Status", ""]}>
          {d.list.map((c) => (
            <tr key={c.id}>
              <Td><Link className="font-medium text-palm-deep" href={`/admin/discounts/${c.id}`}>{c.name}</Link><p className="text-xs text-mute">{c.is_automatic ? "Automatic" : c.code}</p></Td>
              <Td>{c.discount_type === "percentage" ? `${c.discount_value}%` : naira(c.discount_value)}</Td><Td>{c.uses}{c.usage_limit ? ` of ${c.usage_limit}` : ""}</Td><Td>{c.expires_at ? shortDate(c.expires_at) : "No end"}</Td>
              <Td><Badge tone={statusTone(c.state)}>{c.state}</Badge></Td>
              <Td><div className="flex gap-1">
                {["active", "scheduled"].includes(c.state) && <ActionButton action={setDiscountStatus} values={{ id: c.id, status: "paused" }}>Pause</ActionButton>}
                {["paused", "draft"].includes(c.state) && <ActionButton action={setDiscountStatus} values={{ id: c.id, status: "active" }}>{c.state === "draft" ? "Publish" : "Resume"}</ActionButton>}
                {c.state === "draft" && c.uses === 0 ? <ActionButton action={deleteDiscount} values={{ id: c.id }} variant="danger" confirm="Delete this draft?">Delete</ActionButton>
                  : c.state !== "archived" && <ActionButton action={setDiscountStatus} values={{ id: c.id, status: "archived" }} confirm="Archive this discount?">Archive</ActionButton>}
              </div></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
