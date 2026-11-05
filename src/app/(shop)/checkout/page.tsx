import { redirect } from "next/navigation";
import { checkout } from "@/app/actions/shop";
import { Field, Form, Submit } from "@/components/form";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { naira } from "@/lib/format";
import { configuredProviders } from "@/lib/payments/providers";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Checkout" };

export default async function Checkout() {
  const u = await requireUser("/checkout");
  const d = await asUser(u.id, async (db) => ({
    items: await db.rows("select c.quantity, l.title, l.effective_price_kobo from cart_items c join listing_cards l on l.id=c.listing_id where c.user_id=$1", [u.id]),
    uni: await db.one("select pickup_points from universities where id=$1", [u.university_id]),
    pickupOk: await getSetting(db, "pay_on_pickup_enabled", true),
  }));
  if (!d.items.length) redirect("/cart");
  const total = d.items.reduce((s, i) => s + Number(i.effective_price_kobo) * i.quantity, 0);
  const online = configuredProviders();
  const options = d.uni?.pickup_points ?? [];
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6 md:grid-cols-[1fr_300px]">
      <div>
        <h1 className="mb-5 text-3xl font-bold">Checkout</h1>
        {emailEnabled() && !u.email_verified_at && <p className="mb-4 rounded-xl bg-sun/15 px-4 py-2 text-sm">Verify your email to place an order. Check your inbox, or resend the link from your account page.</p>}
        <Form action={checkout} className="space-y-4">
          <Field label="Pickup point on campus" name="pickup_point" as="select">
            {options.map((p: string) => <option key={p}>{p}</option>)}
            {!options.length && <option>Agree with the seller by message</option>}
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">How do you want to pay?</legend>
            <div className="mt-1 space-y-2">
              {online.map((p, i) => (
                <label key={p} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3 has-checked:border-palm">
                  <input type="radio" name="pay" value={`online:${p}`} defaultChecked={i === 0} className="accent-palm" />
                  <span className="font-medium">Pay online with {p === "paystack" ? "Paystack" : "Flutterwave"}</span>
                </label>
              ))}
              {d.pickupOk && (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3 has-checked:border-palm">
                  <input type="radio" name="pay" value="pay_on_pickup" defaultChecked={!online.length} className="accent-palm" />
                  <span><span className="font-medium">Pay the seller at pickup</span><span className="block text-sm text-mute">Cash or transfer when you collect.</span></span>
                </label>
              )}
              {!online.length && <p className="text-sm text-mute">Online payment isn't switched on yet.</p>}
            </div>
          </fieldset>
          <Field label="Discount code (optional)" name="coupon" autoCapitalize="characters" />
          <Field label="Note for the seller (optional)" name="note" as="textarea" rows={2} />
          <Submit size="lg" className="w-full">Place order</Submit>
        </Form>
      </div>
      <aside className="h-fit rounded-tag border border-line bg-card p-4">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-mute">Order summary</h2>
        <ul className="mt-2 space-y-1.5 text-sm">{d.items.map((i, n) => <li key={n} className="flex justify-between gap-2"><span>{i.quantity} × {i.title}</span><span className="tabular-nums">{naira(Number(i.effective_price_kobo) * i.quantity)}</span></li>)}</ul>
        <p className="mt-3 flex justify-between border-t border-line pt-3 font-semibold"><span>Total</span><span className="tabular-nums">{naira(total)}</span></p>
      </aside>
    </div>
  );
}
