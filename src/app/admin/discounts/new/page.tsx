import { DiscountForm } from "@/components/discount-form";
import { Card, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";

export const metadata = { title: "Create discount" };
export default async function New() {
  const a = await requireAdmin();
  const cats = await asUser(a.id, (db) => db.rows("select id,name from categories where is_active order by sort"));
  return <div className="max-w-2xl"><PageHead title="Create discount" /><Card><DiscountForm cats={cats} /></Card></div>;
}
