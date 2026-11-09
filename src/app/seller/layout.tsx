import { DashShell } from "@/components/dash-shell";
import { requireSeller } from "@/lib/auth";

const LINKS: [string, string][] = [["/seller", "Overview"], ["/seller/orders", "Orders"], ["/seller/services", "Service tracking"], ["/seller/pickup", "Pickup points"], ["/seller/listings", "Listings"], ["/messages", "Messages"], ["/seller/storefront", "My Storefront"], ["/seller/analytics", "Analytics"], ["/seller/promotions", "Promotions"], ["/seller/boosts", "Store Boosts"], ["/seller/earnings", "Earnings"], ["/seller/billing", "Plan and billing"]];

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  await requireSeller();
  return <DashShell title="Seller dashboard" links={LINKS}>{children}</DashShell>;
}
