"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { checkout, previewCheckout } from "@/app/actions/shop";
import { Field, Form, Submit } from "./form";
import { buttonClass } from "./ui";
import { naira } from "@/lib/format";

type Q = Awaited<ReturnType<typeof previewCheckout>>;
type Store = { id: string; name: string; options: { name: string; detail: string }[] };

export function CheckoutForm({ online, pickupOk, stores, initial }: { online: string[]; pickupOk: boolean; stores: Store[]; initial: Q }) {
  const [pay, setPay] = useState(online[0] ? `online:${online[0]}` : "pay_on_pickup");
  const [code, setCode] = useState(""); const [applied, setApplied] = useState("");
  const [credit, setCredit] = useState(false);
  const [q, setQ] = useState(initial);
  const [, start] = useTransition();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    start(async () => setQ(await previewCheckout({ code: applied, useCredit: credit, online: pay !== "pay_on_pickup" })));
  }, [pay, applied, credit]);
  const row = (label: string, kobo: number, minus = false) => kobo > 0 && <p className="flex justify-between gap-2 text-sm"><span className="text-mute">{label}</span><span className="tabular-nums">{minus ? "-" : ""}{naira(kobo)}</span></p>;
  return (
    <Form action={checkout} className="grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section>
          <h2 className="text-lg font-bold">Pickup and fulfilment details</h2>
          <p className="text-sm text-mute">Your seller confirms the date and time after accepting your order.</p>
          <div className="mt-2 space-y-3">
            {stores.map((s) => (
              <div key={s.id}>
                <Field label={`Pickup point for ${s.name}`} name={`pickup_${s.id}`} as="select">
                  {s.options.map((o) => <option key={o.name} value={o.name}>{o.detail ? `${o.name} (${o.detail})` : o.name}</option>)}
                </Field>
              </div>
            ))}
          </div>
        </section>
        <fieldset>
          <legend className="text-lg font-bold">How do you want to pay?</legend>
          <div className="mt-1 space-y-2">
            {online.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3 has-checked:border-palm">
                <input type="radio" name="pay" value={`online:${p}`} checked={pay === `online:${p}`} onChange={() => setPay(`online:${p}`)} className="accent-palm" />
                <span className="font-medium">Pay online with {p === "paystack" ? "Paystack" : "Flutterwave"}</span>
              </label>
            ))}
            {pickupOk && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-card p-3 has-checked:border-palm">
                <input type="radio" name="pay" value="pay_on_pickup" checked={pay === "pay_on_pickup"} onChange={() => setPay("pay_on_pickup")} className="accent-palm" />
                <span><span className="font-medium">Pay the seller at pickup</span><span className="block text-sm text-mute">Cash or transfer when you collect. Vybe discounts and reward credit need online payment.</span></span>
              </label>
            )}
            {!online.length && <p className="text-sm text-mute">Online payment isn't switched on yet.</p>}
          </div>
        </fieldset>
        <div>
          <label className="text-sm font-medium" htmlFor="coupon">Discount code</label>
          <div className="mt-1 flex gap-2">
            <input id="coupon" name="coupon" className="input" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="button" className={buttonClass("outline")} onClick={() => setApplied(code)}>Apply</button>
          </div>
          {applied && (q.codeValid ? <p className="mt-1 text-sm text-palm-deep">Code applied.</p> : <p className="mt-1 text-sm text-coral">{q.codeMessage}</p>)}
        </div>
        {q.creditAvailable > 0 && (
          <label className={`flex items-center gap-3 rounded-xl border border-line bg-card p-3 ${q.creditUsable ? "" : "opacity-60"}`}>
            <input type="checkbox" name="use_credit" checked={credit && q.creditUsable} disabled={!q.creditUsable} onChange={(e) => setCredit(e.target.checked)} className="size-4 accent-palm" />
            <span><span className="font-medium">Use my reward credit</span><span className="block text-sm text-mute">{naira(q.creditAvailable)} available{q.creditUsable ? "" : ". Choose online payment to use it."}</span></span>
          </label>
        )}
        <Field label="Note for the seller (optional)" name="note" as="textarea" rows={2} />
      </div>
      <aside className="h-fit space-y-1.5 rounded-tag border border-line bg-card p-4 md:sticky md:top-20">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-mute">Order summary</h2>
        {row("Original price", q.originalKobo)}
        {row("Seller sale", q.saleSavingsKobo, true)}
        {row("Seller discount code", q.couponKobo, true)}
        {q.campaigns.map((c) => <div key={c.id}>{row(c.name, c.kobo, true)}</div>)}
        {row("Reward credit", q.creditKobo, true)}
        <p className="flex justify-between border-t border-line pt-2 font-semibold"><span>You pay</span><span className="tabular-nums" data-testid="total">{naira(q.totalKobo)}</span></p>
        {q.savingsKobo > 0 && <p className="text-sm text-palm-deep">You save {naira(q.savingsKobo)}</p>}
        <p className="pt-2 text-xs text-mute">Vybe Market commission: a percentage of the seller's eligible sale, 5% by default. It comes out of the seller's earnings and is not added to your total.</p>
        <div className="pt-2"><Submit size="lg" className="w-full">Place order</Submit></div>
      </aside>
    </Form>
  );
}
