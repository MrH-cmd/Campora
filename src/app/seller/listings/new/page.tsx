import { sellerContext } from "@/app/actions/seller";
import { ListingForm } from "@/components/listing-form";
import { Card, PageHead } from "@/components/ui";
import { asUser } from "@/lib/db";

export const metadata = { title: "New listing" };
export default async function New() {
  const { user, plan } = await sellerContext();
  const cats = await asUser(user.id, (db) => db.rows("select id,name,kind from categories where is_active order by sort"));
  return <div className="max-w-2xl"><PageHead title="Add a listing" /><Card><ListingForm cats={cats} photoLimit={plan.photo_limit} photoCount={0} /></Card></div>;
}
