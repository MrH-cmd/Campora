import { DashShell } from "@/components/dash-shell";
import { requireAdmin } from "@/lib/auth";

const LINKS: [string, string][] = [["/admin", "Overview"], ["/admin/users", "Users"], ["/admin/verifications", "Student checks"], ["/admin/sellers", "Seller approvals"], ["/admin/listings", "Listings"], ["/admin/categories", "Categories"], ["/admin/reports", "Reports"], ["/admin/disputes", "Disputes"], ["/admin/finance", "Finance"], ["/admin/settings", "Settings"], ["/admin/logs", "Activity log"]];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <DashShell title="Vybe admin" links={LINKS}>{children}</DashShell>;
}
