import Link from "next/link";
import type { ReactNode } from "react";
import { CountBars } from "@/components/charts";
import { Card, PageHead, Stat } from "@/components/ui";
import { naira } from "@/lib/format";
import { analyticsDays, featurePlan, planName, type FeatureKey } from "@/lib/storefront-access";
import { storeStats } from "@/lib/storefront-stats";
import { loadBuilder } from "../data";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Store analytics" };
const SOURCE_LABEL: Record<string, string> = { direct: "Direct or shared link", vybe: "Vybe Market", whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok", x: "X", facebook: "Facebook", google: "Search engines", other: "Other sites" };

export default async function StoreAnalytics() {
  const b = await loadBuilder();
  const days = analyticsDays(b.access.analyticsLevel);
  const s = await storeStats(b.store.id, days); // loadBuilder has already confirmed this seller owns the store
  const on = (k: FeatureKey) => b.access.features[k];
  const plan = (k: FeatureKey) => planName(b.catalog, featurePlan(b.catalog, k));
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
  const Locked = ({ k, children }: { k: FeatureKey; children: ReactNode }) => (
    <Card className="border-dashed" data-locked-analytics={k}>
      <p className="text-sm font-semibold">{children}</p>
      <p className="mt-1 text-sm text-mute">Comes with {plan(k)}. <Link className="font-semibold text-palm-deep underline" href="/seller/billing">See plans</Link></p>
    </Card>
  );
  const best = s.days.reduce((a, d) => (d.visits > a.visits ? d : a), s.days[0]);
  const share = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  const srcTotal = s.sources.reduce((a, x) => a + x.visits, 0);

  return (
    <div>
      <PageHead title="My Storefront" sub={`${b.store.name}: the last ${days} days on ${b.access.name}.`} />
      <StoreTabs on="/analytics" />

      <h2 className="mb-2 font-bold">Visits</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Store visits" value={s.visits} hint="Views of your store page, not counting you" />
        <Stat label="Unique visitors" value={s.unique} hint="Counted once per browser per day" />
        <Stat label="Product views" value={s.productViews} hint="Views of this store's listing pages" />
        <Stat label="Best day" value={s.visits ? label(best.day) : "None yet"} hint={s.visits ? `${best.visits} visits` : "Share your store link"} />
      </div>
      <Card className="mt-3">
        <h3 className="mb-3 font-bold">Visits per day</h3>
        {s.visits === 0 ? <p className="text-sm text-mute">No visits recorded yet. Share your store link to get your first visitors.</p>
          : <CountBars label="Visits" data={s.days.map((d) => ({ name: label(d.day), value: d.visits }))} />}
      </Card>

      <h2 className="mt-7 mb-2 font-bold">Engagement</h2>
      {on("analytics_engagement") ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-analytics="engagement">
            <Stat label="Product clicks" value={s.clicks} hint="Clicks from your store page into a listing" />
            <Stat label="Enquiries" value={s.enquiries} hint="New conversations with buyers" />
            <Stat label="Sales through your store" value={s.orders} hint={`${naira(s.salesKobo)} in completed orders`} />
            <Stat label="Click rate" value={s.visits ? share(s.clicks, s.visits) : "n/a"} hint="Product clicks per store visit" />
          </div>
          <p className="mt-2 text-sm text-mute">Sales through your store counts completed orders from buyers who were logged in and visited your store page in the 7 days before ordering. Buyers who never logged in can&apos;t be matched, so the real number may be higher.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <h3 className="mb-2 font-bold">Most viewed products</h3>
              {s.topProducts.length === 0 ? <p className="text-sm text-mute">No product views yet.</p> : (
                <ol className="space-y-1.5 text-sm">{s.topProducts.map((p, i) => (
                  <li key={p.slug} className="flex justify-between gap-3"><Link className="truncate underline" href={`/listing/${p.slug}`}>{i + 1}. {p.title}</Link><span className="shrink-0 text-mute">{p.views} views, {p.enquiries} enquiries</span></li>
                ))}</ol>
              )}
            </Card>
            <Card>
              <h3 className="mb-3 font-bold">Product clicks per day</h3>
              {s.clicks === 0 ? <p className="text-sm text-mute">No product clicks yet.</p>
                : <CountBars label="Clicks" data={s.days.map((d) => ({ name: label(d.day), value: d.product_clicks }))} />}
            </Card>
          </div>
        </>
      ) : <Locked k="analytics_engagement">Product clicks, enquiries, most viewed products and sales through your store</Locked>}

      <h2 className="mt-7 mb-2 font-bold">Visitor insights</h2>
      {on("analytics_insights") ? (
        <div className="grid gap-3 lg:grid-cols-3" data-analytics="insights">
          <Stat label="Conversion" value={s.conversion == null ? "No visitors yet" : `${(s.conversion * 100).toFixed(1)}%`} hint="Sales through your store divided by unique visitors" />
          <Card>
            <h3 className="mb-2 font-bold">Where visitors come from</h3>
            {srcTotal === 0 ? <p className="text-sm text-mute">No visits with a known source yet.</p> : (
              <ul className="space-y-1.5 text-sm">{s.sources.map((x) => (
                <li key={x.source}>
                  <span className="flex justify-between"><span>{SOURCE_LABEL[x.source] ?? x.source}</span><span className="text-mute">{x.visits} ({share(x.visits, srcTotal)})</span></span>
                  <span className="mt-0.5 block h-1.5 rounded-full bg-white/10"><span className="block h-full rounded-full bg-palm" style={{ width: share(x.visits, srcTotal) }} /></span>
                </li>
              ))}</ul>
            )}
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">Devices</h3>
            {srcTotal === 0 ? <p className="text-sm text-mute">No visits yet.</p> : (
              <ul className="space-y-1 text-sm">{s.devices.map((x) => <li key={x.device} className="flex justify-between capitalize"><span>{x.device}</span><span className="text-mute">{share(x.visits, srcTotal)}</span></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-mute">Only the kind of site and device is recorded, never addresses or identities.</p>
          </Card>
        </div>
      ) : <Locked k="analytics_insights">Conversion rate, where your visitors come from (WhatsApp, Instagram, TikTok and more) and which devices they use</Locked>}
    </div>
  );
}
