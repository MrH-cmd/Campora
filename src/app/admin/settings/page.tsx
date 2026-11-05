import { saveBoostPackage, saveCampaign, savePlan, saveSettings, saveUniversity, stopCampaign } from "@/app/actions/admin";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Card, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Settings" };
const n = (k: unknown) => (k == null ? "" : Number(k) / 100);

export default async function Settings() {
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => ({
    plans: await db.rows("select * from subscription_plans order by sort"),
    boosts: await db.rows("select * from boost_packages order by created_at"),
    unis: await db.rows("select * from universities order by name"),
    camps: await db.rows("select * from promotional_campaigns where storefront_id is null and is_active and ends_at>now() order by created_at desc"),
    bps: await getSetting(db, "commission_bps", 500), pickup: await getSetting(db, "pay_on_pickup_enabled", true), review: await getSetting(db, "require_listing_review", true), grace: await getSetting(db, "deletion_grace_days", 7), student: await getSetting(db, "selling_requires_student", true),
  }));
  return (
    <>
      <PageHead title="Platform settings" />
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-bold">Marketplace rules</h2>
          <Form action={saveSettings} className="mt-2 max-w-sm space-y-3">
            <Field label="Commission (%)" name="commission_percent" type="number" step="0.1" defaultValue={d.bps / 100} hint="Applies to future sales. Past sales keep their rate. Set category rates under Categories." />
            <Field label="Account deletion grace period (days)" name="deletion_grace_days" type="number" defaultValue={d.grace} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="selling_requires_student" defaultChecked={d.student} className="size-4 accent-palm" />Selling requires a verified student</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pay_on_pickup_enabled" defaultChecked={d.pickup} className="size-4 accent-palm" />Allow pay at pickup</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="require_listing_review" defaultChecked={d.review} className="size-4 accent-palm" />New listings need admin approval</label>
            <Submit>Save rules</Submit>
          </Form>
        </Card>
        <section><h2 className="mb-2 text-lg font-bold">Subscription plans</h2>
          <div className="grid gap-3 lg:grid-cols-3">{d.plans.map((p) => (
            <Card key={p.id}><h3 className="font-bold">{p.name}</h3>
              <Form action={savePlan} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Price per month (₦)" name="price" defaultValue={n(p.price_kobo)} hint="Leave empty to keep it off sale." />
                <div className="grid grid-cols-3 gap-2"><Field label="Listings" name="listing_limit" type="number" defaultValue={p.listing_limit} /><Field label="Photos" name="photo_limit" type="number" defaultValue={p.photo_limit} /><Field label="Credits" name="monthly_boost_credits" type="number" defaultValue={p.monthly_boost_credits} /></div>
                <Submit size="sm">Save {p.name}</Submit>
              </Form>
            </Card>
          ))}</div>
        </section>
        <section><h2 className="mb-2 text-lg font-bold">Store Boost packages</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {[...d.boosts, null].map((b, i) => (
              <Card key={b?.id ?? i}>
                <Form action={saveBoostPackage} className="space-y-2">
                  <input type="hidden" name="id" value={b?.id ?? ""} />
                  <Field label={b ? "Name" : "New package"} name="name" defaultValue={b?.name} />
                  <Field label="Placement" name="placement" as="select" defaultValue={b?.placement}><option value="homepage_featured">Homepage featured</option><option value="search_priority">Top of search</option><option value="storefront_promoted">Promoted storefront</option></Field>
                  <div className="grid grid-cols-3 gap-2"><Field label="Days" name="duration_days" type="number" defaultValue={b?.duration_days ?? 7} /><Field label="Price ₦" name="price" defaultValue={n(b?.price_kobo)} /><Field label="Credits" name="credit_cost" type="number" defaultValue={b?.credit_cost ?? 1} /></div>
                  {b && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={b.is_active} className="accent-palm" />On sale</label>}
                  <Submit size="sm" variant={b ? "primary" : "dark"}>{b ? "Save package" : "Add package"}</Submit>
                </Form>
              </Card>
            ))}
          </div>
        </section>
        <section><h2 className="mb-2 text-lg font-bold">Universities</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {[...d.unis, null].map((u, i) => (
              <Card key={u?.id ?? i}>
                <Form action={saveUniversity} className="space-y-2">
                  <input type="hidden" name="id" value={u?.id ?? ""} />
                  <div className="grid grid-cols-[2fr_1fr] gap-2"><Field label={u ? "Name" : "Add a university"} name="name" defaultValue={u?.name} /><Field label="Short name" name="short_name" defaultValue={u?.short_name} /></div>
                  <div className="grid grid-cols-2 gap-2"><Field label="City" name="city" defaultValue={u?.city ?? ""} /><Field label="State" name="state" defaultValue={u?.state ?? ""} /></div>
                  <Field label="Verification methods" name="verification_methods" defaultValue={u?.verification_methods?.join(", ") ?? "id_upload"} hint="student_email, id_upload" />
                  <Field label="Student email domains" name="student_email_domains" defaultValue={u?.student_email_domains?.join(", ") ?? ""} />
                  <Field label="Pickup points" name="pickup_points" defaultValue={u?.pickup_points?.join(", ") ?? ""} hint="Separate with commas" />
                  {u && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={u.is_active} className="accent-palm" />Open for sign-ups</label>}
                  <Submit size="sm" variant={u ? "primary" : "dark"}>{u ? "Save university" : "Add university"}</Submit>
                </Form>
              </Card>
            ))}
          </div>
        </section>
        <section><h2 className="mb-2 text-lg font-bold">Homepage campaigns and ads</h2>
          <Card className="max-w-xl">
            <Form action={saveCampaign} resetOnSuccess className="space-y-2">
              <Field label="Title" name="title" /><Field label="Message" name="body" /><Field label="Link on Vybe Market" name="href" placeholder="/search?category=food" />
              <Field label="Days live" name="days" type="number" defaultValue={7} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_sponsored" className="accent-palm" />Paid placement (shows a Sponsored label)</label>
              <Submit size="sm">Publish campaign</Submit>
            </Form>
            <ul className="mt-3 divide-y divide-line text-sm">{d.camps.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span>{c.title}, ends {shortDate(c.ends_at)}</span><ActionButton action={stopCampaign} values={{ id: c.id }}>Stop</ActionButton></li>)}</ul>
          </Card>
        </section>
      </div>
    </>
  );
}
