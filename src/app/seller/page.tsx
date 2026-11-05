import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sellerContext } from "@/app/actions/seller";
import { SalesChart } from "@/components/charts";
import { CountUp, Stagger } from "@/components/motion";
import { DashboardCustomizer } from "@/components/seller-dashboard";
import { ShareButton } from "@/components/share";
import { Badge, Card, Empty, Img, LinkButton, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { naira, ORDER_STATUS_LABEL, timeAgo } from "@/lib/format";
import { WIDGETS } from "@/lib/widgets";

export const metadata = { title: "Seller dashboard" };

const greeting = () => { const h = (new Date().getUTCHours() + 1) % 24; return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export default async function Overview() {
  const { user, store, plan } = await sellerContext();
  if (!store) redirect("/seller/storefront");
  const d = await asUser(user.id, async (db) => ({
    s: await db.one(
      `select
        (select coalesce(sum(total_kobo),0) from orders where storefront_id=$1 and status='completed') sales,
        (select count(*)::int from orders where storefront_id=$1 and payment_status<>'awaiting_payment') orders,
        (select count(*)::int from orders where storefront_id=$1 and status='pending' and payment_status<>'awaiting_payment') pending,
        (select count(*)::int from orders where storefront_id=$1 and status in ('accepted','processing')) preparing,
        (select count(*)::int from orders where storefront_id=$1 and status='ready_for_pickup') ready,
        (select count(*)::int from listings where storefront_id=$1 and status in ('active','pending_review')) active,
        (select count(*)::int from listings where storefront_id=$1) total_listings,
        (select count(*)::int from conversations where storefront_id=$1) enquiries,
        (select count(*)::int from messages m join conversations c on c.id=m.conversation_id where c.storefront_id=$1 and m.sender_id<>$2 and m.read_at is null) unread`, [store.id, user.id]),
    bal: await db.one("select * from seller_balances where storefront_id=$1", [store.id]),
    series: await db.rows(
      `select to_char(d,'DD Mon') as day, coalesce(sum(o.total_kobo),0)/100 as value
       from generate_series(current_date-13, current_date, '1 day') d
       left join orders o on o.storefront_id=$1 and o.status='completed' and o.updated_at::date=d group by d order by d`, [store.id]),
    recent: await db.rows(
      `select o.id, o.number, o.status, o.total_kobo, o.created_at, u.full_name from orders o join users u on u.id=o.buyer_id
       where o.storefront_id=$1 and o.payment_status<>'awaiting_payment' order by o.updated_at desc limit 6`, [store.id]),
    top: await db.rows("select id, title, cover, sold_count, effective_price_kobo from listing_cards where storefront_id=$1 order by sold_count desc, created_at desc limit 5", [store.id]),
    bank: await db.one("select account_number, dashboard_layout from seller_profiles where user_id=$1", [user.id]),
  }));
  const available = Number(d.bal.earned_kobo) - Number(d.bal.paid_out_kobo) - Number(d.bal.requested_kobo);
  const setup: [string, boolean, string][] = [
    ["Add your logo and cover", !!store.logo_path && !!store.cover_path, "/seller/storefront"],
    ["Write your business description", !!store.description, "/seller/storefront"],
    ["Publish your first listing", d.s.total_listings > 0, "/seller/listings/new"],
    ["Add your payout account", !!d.bank?.account_number, "/seller/storefront"],
  ];
  const tasks: [number, string, string][] = [
    [d.s.pending, "orders to accept or reject", "/seller/orders?status=pending"],
    [d.s.preparing, "orders being prepared", "/seller/orders?status=accepted"],
    [d.s.ready, "orders waiting for pickup", "/seller/orders?status=ready_for_pickup"],
    [d.s.unread, "unread messages", "/messages"],
  ];
  const open = tasks.filter(([n]) => n > 0);
  const pct = Math.min(100, Math.round((d.s.active / plan.listing_limit) * 100));

  const widgets: Record<string, React.ReactNode> = {
    tasks: (
      <Card className="h-full">
        <h2 className="font-bold">What needs you now</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-mute">You're all caught up.</p> : (
          <ul className="mt-2 space-y-1.5">{open.map(([n, label, href]) => (
            <li key={label}><Link href={href} className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-2.5 transition hover:bg-mint">
              <span className="pulse-dot grid size-7 place-items-center rounded-full bg-palm text-sm font-bold text-white">{n}</span><span>{label}</span></Link></li>
          ))}</ul>
        )}
        {setup.some(([, ok]) => !ok) && (
          <>
            <h3 className="mt-4 font-sans text-sm font-semibold tracking-normal text-mute">Finish setting up</h3>
            <ul className="mt-1 space-y-1 text-sm">{setup.map(([label, ok, href]) => (
              <li key={label}><Link href={href} className={`flex items-center gap-2 py-1 ${ok ? "text-mute line-through" : "hover:text-palm-deep"}`}>
                <span className={`grid size-5 place-items-center rounded-full ${ok ? "bg-palm text-white" : "border border-line"}`}>{ok && <Check size={12} aria-hidden />}</span>{label}</Link></li>
            ))}</ul>
          </>
        )}
      </Card>
    ),
    stats: (
      <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[["Total sales", <CountUp key="a" value={Math.round(Number(d.s.sales) / 100)} format="naira" />], ["Total orders", <CountUp key="b" value={d.s.orders} />], ["Pending orders", <CountUp key="c" value={d.s.pending} />],
          ["Active listings", <CountUp key="d" value={d.s.active} />], ["Total earnings", <CountUp key="e" value={Math.round(Number(d.bal.earned_kobo) / 100)} format="naira" />], ["Enquiries", <CountUp key="f" value={d.s.enquiries} />]].map(([label, v]) => (
          <div key={String(label)} className="glow-card rounded-tag border border-line bg-card p-4"><p className="text-sm text-mute">{label}</p><p className="display mt-1 text-2xl font-bold tabular-nums">{v}</p></div>
        ))}
      </Stagger>
    ),
    sales: <Card className="h-full"><h2 className="mb-2 font-bold">Sales, last 14 days</h2><SalesChart data={d.series.map((r) => ({ day: r.day, value: Number(r.value) }))} /></Card>,
    activity: (
      <Card className="h-full"><h2 className="mb-2 font-bold">Recent orders</h2>
        {d.recent.length === 0 ? <Empty title="No orders yet" body="Share your storefront link to get your first one." /> : (
          <ul className="divide-y divide-line">{d.recent.map((o) => (
            <li key={o.id}><Link href={`/seller/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{o.full_name}</span><span className="text-xs text-mute">{naira(o.total_kobo)}, {timeAgo(o.created_at)}</span></span>
              <Badge tone={statusTone(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge></Link></li>
          ))}</ul>
        )}
      </Card>
    ),
    plan: (
      <Card className="h-full">
        <div className="flex items-center justify-between"><h2 className="font-bold">{plan.name} plan</h2><Link href="/seller/billing" className="text-sm font-semibold text-palm-deep">Manage</Link></div>
        <p className="mt-2 text-sm text-mute">{d.s.active} of {plan.listing_limit} listings used</p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Listing allowance used"><div className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#e879f9] transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        {pct >= 80 && <p className="mt-2 text-sm text-palm-deep">You're close to your limit. Upgrade to keep listing.</p>}
      </Card>
    ),
    earnings: (
      <Card className="h-full">
        <h2 className="font-bold">Available to withdraw</h2>
        <p className="display mt-1 text-3xl font-bold tabular-nums"><CountUp value={Math.round(available / 100)} format="naira" /></p>
        <Link href="/seller/earnings" className="mt-1 inline-block text-sm font-semibold text-palm-deep">Go to earnings</Link>
      </Card>
    ),
    top: (
      <Card className="h-full"><h2 className="mb-2 font-bold">Your best sellers</h2>
        {d.top.length === 0 ? <p className="text-sm text-mute">Your listings will show here.</p> : (
          <ul className="space-y-2">{d.top.map((t) => (
            <li key={t.id}><Link href={`/seller/listings/${t.id}`} className="flex items-center gap-2.5 text-sm">
              <Img path={t.cover} alt="" className="size-10 rounded-lg" /><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="text-mute">{t.sold_count} sold</span></Link></li>
          ))}</ul>
        )}
      </Card>
    ),
  };
  const all = WIDGETS.map((w) => w.id);
  const layout: string[] = d.bank?.dashboard_layout ?? all;

  return (
    <>
      <section className="aurora relative mb-5 overflow-hidden rounded-[24px] border border-line bg-panel p-6">
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <Img path={store.logo_path} alt="" className="size-16 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-white/70">{greeting()}, {user.full_name.split(" ")[0]}</p>
            <h1 className="gradient-text text-3xl font-bold">{store.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShareButton url={`/store/${store.slug}`} />
            <LinkButton href="/seller/listings/new"><Plus size={17} aria-hidden />Add a listing</LinkButton>
          </div>
        </div>
      </section>
      <div className="mb-3 flex justify-end"><DashboardCustomizer layout={layout} /></div>
      {layout.length === 0 ? <Empty title="Your dashboard is empty" body="Turn on the sections you want with Customize." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {layout.map((id) => <div key={id} className={WIDGETS.find((w) => w.id === id)?.wide ? "lg:col-span-2" : ""}>{widgets[id]}</div>)}
        </div>
      )}
    </>
  );
}
