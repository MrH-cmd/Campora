"use client";
import { useState } from "react";
import { saveListing } from "@/app/actions/seller";
import { Field, Form, ImagePicker } from "./form";

export function ListingForm({ l, cats, photoLimit, photoCount }: { l?: any; cats: any[]; photoLimit: number; photoCount: number }) {
  const [kind, setKind] = useState<string>(l?.kind ?? "product");
  return (
    <Form action={saveListing} className="space-y-3">
      <input type="hidden" name="id" value={l?.id ?? ""} />
      {l ? <input type="hidden" name="kind" value={kind} /> : (
        <fieldset className="flex gap-2"><legend className="mb-1 text-sm font-medium">What are you listing?</legend>
          {["product", "service"].map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 capitalize has-checked:border-palm">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-palm" />{k}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Title" name="title" defaultValue={l?.title} required />
      <Field label="Category" name="category_id" as="select" defaultValue={l?.category_id}>{cats.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
      <Field label="Description" name="description" as="textarea" rows={5} defaultValue={l?.description} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === "service" ? "Price or starting price (₦)" : "Price (₦)"} name="price" inputMode="decimal" defaultValue={l ? Number(l.price_kobo) / 100 : ""} required />
        <Field label="Sale price (₦, optional)" name="sale_price" inputMode="decimal" defaultValue={l?.sale_price_kobo ? Number(l.sale_price_kobo) / 100 : ""} />
      </div>
      {kind === "product" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock" name="stock" type="number" min={0} defaultValue={l?.stock ?? 1} />
          <Field label="Condition" name="item_condition" as="select" defaultValue={l?.item_condition ?? "new"}>
            <option value="new">New</option><option value="like_new">Like new</option><option value="used">Used</option><option value="handmade">Handmade</option>
          </Field>
        </div>
      ) : (
        <>
          <Field label="Pricing" name="price_type" as="select" defaultValue={l?.price_type ?? "fixed"}><option value="fixed">Fixed price (buyers can book directly)</option><option value="starting_from">Starting from (buyers message for a quote)</option></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Availability" name="availability" placeholder="Weekdays after 4pm" defaultValue={l?.availability ?? ""} />
            <Field label="Turnaround" name="turnaround" placeholder="2 days" defaultValue={l?.turnaround ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="hidden" name="is_available" value="off" /><input type="checkbox" name="is_available" value="on" defaultChecked={l?.is_available ?? true} className="size-4 accent-palm" />Taking bookings now</label>
        </>
      )}
      <label className="block text-sm font-medium">{kind === "service" ? "Portfolio images" : "Photos"}<ImagePicker max={photoLimit} existing={photoCount} /></label>
      <div className="flex gap-2 pt-1">
        <button name="intent" value="publish" className="inline-flex h-11 items-center rounded-xl bg-palm px-5 font-semibold text-white hover:bg-palm-deep">Publish</button>
        <button name="intent" value="draft" className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-5 font-semibold">Save as draft</button>
      </div>
    </Form>
  );
}
