import { saveDiscount } from "@/app/actions/admin";
import { Field, Form } from "./form";

const local = (d?: string | Date | null) => (d ? new Date(new Date(d).getTime() + 3600_000).toISOString().slice(0, 16) : "");
const naira = (k: unknown) => (k == null ? "" : Number(k) / 100);

export function DiscountForm({ c, cats, used }: { c?: any; cats: any[]; used?: boolean }) {
  return (
    <Form action={saveDiscount} className="space-y-5">
      <input type="hidden" name="id" value={c?.id ?? ""} />
      {used && <p className="rounded-lg bg-sun/15 px-3 py-2 text-sm">Customers have used this discount, so its value, targets and funding are locked. You can still change its name, audience, end date and limits.</p>}
      <section className="space-y-2"><h2 className="font-bold">Basics</h2>
        <Field label="Discount name" name="name" defaultValue={c?.name} />
        <Field label="Description" name="description" defaultValue={c?.description ?? ""} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="How customers get it" name="mode" as="select" defaultValue={c?.is_automatic ? "automatic" : "code"}><option value="code">They enter a code</option><option value="automatic">Applied automatically</option></Field>
          <Field label="Code" name="code" defaultValue={c?.code ?? ""} placeholder="WELCOME1000" />
          <Field label="Type" name="discount_type" as="select" defaultValue={c?.discount_type ?? "percentage"}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off</option></Field>
          <Field label="Value (% or ₦)" name="value" inputMode="decimal" defaultValue={c ? (c.discount_type === "fixed" ? Number(c.discount_value) / 100 : c.discount_value) : ""} />
        </div>
      </section>
      <section className="space-y-2"><h2 className="font-bold">Who can use it</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Customers" name="user_scope" as="select" defaultValue={c?.user_scope ?? "all"}><option value="all">All users</option><option value="new_users">New users</option><option value="first_time">First-time customers</option><option value="selected">Selected users</option></Field>
          <Field label="New means joined within (days)" name="new_user_days" type="number" defaultValue={c?.new_user_days ?? 30} />
        </div>
        <Field label="Selected users' emails" name="selected_users" as="textarea" rows={2} defaultValue={c?.selected_user_emails?.join(", ") ?? ""} />
      </section>
      <section className="space-y-2"><h2 className="font-bold">What it applies to</h2>
        <p className="text-sm text-mute">Leave all of these empty to cover everything.</p>
        <label className="block text-sm font-medium">Categories
          <select name="categories" multiple defaultValue={c?.target_category_ids ?? []} className="input mt-1 h-32">{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
        <Field label="Listing IDs" name="listings" defaultValue={c?.target_listing_ids?.join(", ") ?? ""} />
        <Field label="Seller store IDs" name="storefronts" defaultValue={c?.target_storefront_ids?.join(", ") ?? ""} />
      </section>
      <section className="space-y-2"><h2 className="font-bold">Limits and dates</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Minimum purchase (₦)" name="minimum_order" defaultValue={naira(c?.minimum_order_kobo) || ""} />
          <Field label="Maximum discount (₦)" name="maximum_discount" defaultValue={naira(c?.maximum_discount_kobo)} />
          <Field label="Total redemptions" name="usage_limit" defaultValue={c?.usage_limit ?? ""} placeholder="No limit" />
          <Field label="Uses per customer" name="per_user_limit" type="number" defaultValue={c?.per_user_limit ?? 1} />
          <Field label="Starts (Lagos time)" name="starts_at" type="datetime-local" defaultValue={local(c?.starts_at)} />
          <Field label="Ends (Lagos time)" name="expires_at" type="datetime-local" defaultValue={local(c?.expires_at)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="stackable" defaultChecked={c?.stackable} className="size-4 accent-palm" />Can combine with other promotions</label>
      </section>
      <section className="space-y-2"><h2 className="font-bold">Who pays for it</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Funding" name="funding_source" as="select" defaultValue={c?.funding_source ?? "platform"}><option value="platform">Vybe Market</option><option value="seller">Seller</option><option value="shared">Shared</option></Field>
          <Field label="Seller's share (%)" name="seller_share_percent" type="number" defaultValue={c?.seller_share_percent ?? 0} />
          <Field label="Seller agreement reference" name="seller_agreement_ref" defaultValue={c?.seller_agreement_ref ?? ""} />
        </div>
        <p className="text-sm text-mute">Sellers are only charged with an agreement on file. Otherwise Vybe Market covers the cost.</p>
      </section>
      <div className="flex gap-2">
        <button name="intent" value="active" className="inline-flex h-11 items-center rounded-xl bg-palm px-5 font-semibold text-white hover:bg-palm-hover">Save and publish</button>
        <button name="intent" value="draft" className="inline-flex h-11 items-center rounded-xl border border-line px-5 font-semibold">Save as draft</button>
      </div>
    </Form>
  );
}
