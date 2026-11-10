import { sellerContext } from "@/app/actions/seller";
import { DashShell } from "@/components/dash-shell";
import { StoreSwitcher } from "@/components/store-switcher";

const LINKS: [string, string][] = [["/seller", "Overview"], ["/seller/orders", "Orders"], ["/seller/services", "Service tracking"], ["/seller/pickup", "Pickup points"], ["/seller/listings", "Listings"], ["/messages", "Messages"], ["/seller/storefront", "My Storefront"], ["/seller/analytics", "Analytics"], ["/seller/promotions", "Promotions"], ["/seller/boosts", "Store Boosts"], ["/seller/earnings", "Earnings"], ["/seller/billing", "Plan and billing"]];

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const { stores, store, plan } = await sellerContext();
  const list = stores.map((s) => ({ id: s.id, name: s.name, live: s.within_plan }));
  return (
    <DashShell title="Seller dashboard" links={LINKS} top={<StoreSwitcher stores={list} current={store?.id ?? null} limit={plan.storefront_limit} />}>
      {store && !store.within_plan && (
        <div className="mb-4 rounded-tag border border-sun/50 bg-sun/10 p-3 text-sm">
          <b>{store.name} is paused.</b> Your {plan.name} plan includes {plan.storefront_limit} storefront{plan.storefront_limit > 1 ? "s" : ""}, so buyers can&apos;t see this one.
          Nothing has been deleted. <a className="font-semibold underline" href="/seller/storefront/stores">Choose which stores stay live</a> or <a className="font-semibold underline" href="/seller/billing">upgrade</a>.
        </div>
      )}
      {children}
    </DashShell>
  );
}
