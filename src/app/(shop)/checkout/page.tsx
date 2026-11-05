import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { requireUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { configuredProviders } from "@/lib/payments/providers";
import { quote } from "@/lib/pricing";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Checkout" };

export default async function Checkout() {
  const u = await requireUser("/checkout");
  const online = configuredProviders();
  const d = await asSystem(async (db) => {
    const q = await quote(db, u, { online: online.length > 0 });
    const uni = await db.one("select pickup_points from universities where id=$1", [u.university_id]);
    const stores = [];
    for (const s of q.stores) {
      const own = await db.rows("select name, available_days, time_window from storefront_pickup_points where storefront_id=$1 and is_active order by created_at", [s.storefront_id]);
      const options = own.length ? own.map((o) => ({ name: o.name, detail: [o.available_days, o.time_window].filter(Boolean).join(", ") }))
        : (uni?.pickup_points ?? []).map((n: string) => ({ name: n, detail: "" }));
      stores.push({ id: s.storefront_id, name: s.store_name, options: options.length ? options : [{ name: "Agree with the seller by message", detail: "" }] });
    }
    return { q, stores, pickupOk: await getSetting(db, "pay_on_pickup_enabled", true) };
  });
  if (!d.q.stores.length) redirect("/cart");
  const { stores: _s, ...initial } = d.q;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-5 text-3xl font-bold">Checkout</h1>
      {emailEnabled() && !u.email_verified_at && <p className="mb-4 rounded-xl bg-sun/15 px-4 py-2 text-sm">Verify your email to place an order. Resend the link from your account page.</p>}
      <CheckoutForm online={online} pickupOk={d.pickupOk} stores={d.stores} initial={initial} />
    </div>
  );
}
