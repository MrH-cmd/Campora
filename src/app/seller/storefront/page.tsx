import Link from "next/link";
import { saveBank, saveStorefront, sellerContext } from "@/app/actions/seller";
import { Field, Form, ImagePicker, Submit } from "@/components/form";
import { Card, PageHead } from "@/components/ui";
import { asUser } from "@/lib/db";

export const metadata = { title: "Storefront" };
export default async function Storefront() {
  const { user, store: s, plan } = await sellerContext();
  const profile = await asUser(user.id, (db) => db.one("select * from seller_profiles where user_id=$1", [user.id]));
  const custom = plan.customization_level;
  return (
    <div className="max-w-2xl space-y-4">
      <PageHead title={s ? "Your storefront" : "Set up your storefront"} sub={s ? undefined : "This is the page buyers see."} action={s && <Link className="font-semibold text-palm-deep underline" href={`/store/${s.slug}`}>View public page</Link>} />
      <Card>
        <Form action={saveStorefront} className="space-y-3">
          <Field label="Business name" name="name" defaultValue={s?.name ?? profile?.business_name} />
          <Field label="Tagline" name="tagline" defaultValue={s?.tagline ?? ""} />
          <Field label="About your business" name="description" as="textarea" rows={4} defaultValue={s?.description ?? ""} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" name="contact_phone" type="tel" defaultValue={s?.contact_phone ?? ""} /><Field label="WhatsApp" name="contact_whatsapp" type="tel" defaultValue={s?.contact_whatsapp ?? ""} />
            <Field label="Contact email" name="contact_email" type="email" defaultValue={s?.contact_email ?? ""} /><Field label="Where on campus" name="campus_location" defaultValue={s?.campus_location ?? ""} />
          </div>
          <label className="block text-sm font-medium">Logo<ImagePicker name="logo" max={1} multiple={false} /></label>
          <label className="block text-sm font-medium">Cover image<ImagePicker name="cover" max={1} multiple={false} /></label>
          <hr className="border-line" />
          <h2 className="font-bold">Customization</h2>
          {custom >= 1 ? (
            <>
              <Field label="Accent colour" name="accent" type="color" defaultValue={s?.accent ?? "#0B8F5A"} className="input mt-1 h-12" />
              <Field label="Announcement banner" name="announcement" defaultValue={s?.announcement ?? ""} />
            </>
          ) : <p className="text-sm text-mute">Accent colours and announcement banners come with <Link className="underline" href="/seller/billing">No Dulling</Link>.</p>}
          {custom >= 2 ? (
            <Field label="Layout" name="layout" as="select" defaultValue={s?.layout ?? "grid"}><option value="grid">Grid</option><option value="editorial">Editorial, large cover</option></Field>
          ) : <p className="text-sm text-mute">Layouts come with <Link className="underline" href="/seller/billing">Odogwu</Link>.</p>}
          <Submit>{s ? "Save storefront" : "Create storefront"}</Submit>
        </Form>
      </Card>
      <Card>
        <h2 className="font-bold">Payout account</h2>
        <Form action={saveBank} className="mt-2 space-y-3">
          <Field label="Bank" name="bank_name" defaultValue={profile?.bank_name ?? ""} />
          <Field label="Account number" name="account_number" inputMode="numeric" defaultValue={profile?.account_number ?? ""} />
          <Field label="Account name" name="account_name" defaultValue={profile?.account_name ?? ""} />
          <Submit variant="outline">Save payout account</Submit>
        </Form>
      </Card>
    </div>
  );
}
