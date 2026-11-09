import Link from "next/link";
import { CountBars } from "@/components/charts";
import { Card, PageHead, Stat } from "@/components/ui";
import { naira } from "@/lib/format";
import { analyticsDays } from "@/lib/storefront-access";
import { storeStats } from "@/lib/storefront-stats";
import { loadBuilder } from "../data";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Store analytics" };
export default async function StoreAnalytics() {
  const b = await loadBuilder();
  const days = analyticsDays(b.access.analyticsLevel);
  const s = await storeStats(b.store.id, days); // loadBuilder has already confirmed this seller owns the store
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
  return (
    <div>
      <PageHead title="My Storefront" sub={`Store page activity for the last ${days} days on ${b.access.name}.`} />
      <StoreTabs on="/analytics" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Store visits" value={s.visits} hint="Views of your store page, not counting you" />
        <Stat label="Unique visitors" value={s.unique} hint="Counted once per browser per day" />
        <Stat label="Product clicks" value={s.clicks} hint="Clicks from your store page into a listing" />
        <Stat label="Enquiries" value={s.enquiries} hint="New conversations with buyers" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales through your store" value={s.orders} hint={`${naira(s.salesKobo)} in completed orders`} />
        {b.access.analyticsLevel >= 2
          ? <Stat label="Conversion" value={s.conversion == null ? "No visitors yet" : `${(s.conversion * 100).toFixed(1)}%`} hint="Sales through your store divided by unique visitors" />
          : <Card><p className="text-sm text-mute">Conversion rate</p><p className="mt-1 text-sm">Comes with Odogwu. <Link className="font-semibold text-palm-deep underline" href="/seller/billing">See plans</Link></p></Card>}
      </div>
      <p className="mt-3 text-sm text-mute">How "sales through your store" is counted: completed orders from buyers who were logged in and visited your store page in the 7 days before they ordered. Buyers who never logged in can't be matched, so the real number may be higher.</p>
      <Card className="mt-5">
        <h2 className="mb-3 font-bold">Visits per day</h2>
        {s.visits === 0 ? <p className="text-sm text-mute">No visits recorded yet. Share your store link to get your first visitors.</p>
          : <CountBars label="Visits" data={s.days.map((d) => ({ name: label(d.day), value: d.visits }))} />}
      </Card>
      <Card className="mt-4">
        <h2 className="mb-3 font-bold">Product clicks per day</h2>
        {s.clicks === 0 ? <p className="text-sm text-mute">No product clicks yet.</p>
          : <CountBars label="Clicks" data={s.days.map((d) => ({ name: label(d.day), value: d.product_clicks }))} />}
      </Card>
    </div>
  );
}
