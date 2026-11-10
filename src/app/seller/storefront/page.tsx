import Link from "next/link";
import { saveBank, saveStorefront, sellerContext } from "@/app/actions/seller";
import { restoreDesign, saveStoreExtras } from "@/app/actions/storefront";
import { ActionButton, Field, Form, ImagePicker, Submit } from "@/components/form";
import { ShareButton } from "@/components/share";
import { Badge, Card, LinkButton, PageHead, statusTone } from "@/components/ui";
import { asUser } from "@/lib/db";
import { transfers } from "@/lib/payments/providers";
import { SOCIAL_HOSTS, type Social } from "@/lib/storefront-design";
import { canUseTemplate } from "@/lib/storefront-access";
import { shortDate } from "@/lib/format";
import { loadBuilder } from "./data";
import { StoreTabs } from "./tabs";

export const metadata = { title: "My Storefront" };
const SOCIAL_LABEL: Record<Social, string> = { instagram: "Instagram", tiktok: "TikTok", x: "X", facebook: "Facebook", youtube: "YouTube", whatsapp: "WhatsApp link" };

export default async function Storefront() {
  const { user, store: s } = await sellerContext();
  const profile = await asUser(user.id, (db) => db.one("select * from seller_profiles where user_id=$1", [user.id]));
  const banks = transfers.configured() ? await transfers.banks().catch(() => []) : [];
  const { stores } = await sellerContext();
  const b = s ? await loadBuilder() : null;
  const sub = await asUser(user.id, (db) => db.one("select expires_at from subscriptions where seller_id=$1 and status='active' order by expires_at desc nulls last limit 1", [user.id]));
  const active = b ? b.catalog.templates.filter((t) => t.is_active !== false) : [];
  const allTemplates = active.length;
  const openTemplates = b ? active.filter((t) => canUseTemplate(b.catalog, b.access, t)).length : 0;
  const featuresOn = b ? Object.values(b.access.features).filter(Boolean).length : 0;
  const template = b ? b.catalog.templates.find((t) => t.slug === (b.published ?? b.draft).template) : null;
  const dirty = b && b.row?.draft && JSON.stringify(b.row.draft) !== JSON.stringify(b.row.published);

  return (
    <div className="space-y-4">
      <PageHead title={s ? "My Storefront" : "Set up your storefront"} sub={s ? "Your branded store page. Design it here, then publish." : "This is the page buyers see."}
        action={s && <div className="flex gap-2"><ShareButton url={`/store/${s.slug}`} /><LinkButton href={`/store/${s.slug}`} variant="outline" size="sm">View live store</LinkButton></div>} />
      {b && <StoreTabs on="" />}

      {b && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-mute">Status</p>
            <p className="mt-1"><Badge tone={statusTone(b.store.status)}>{b.store.status}</Badge>{b.store.is_featured && <span className="ml-2"><Badge tone="green">Featured</Badge></span>}</p>
            {b.store.status_reason && <p className="mt-2 text-sm text-mute">Reason: {b.store.status_reason}</p>}
            <p className="mt-3 break-all text-sm"><Link className="font-semibold text-palm-deep underline" href={`/store/${b.store.slug}`}>vybemarket.vercel.app/store/{b.store.slug}</Link></p>
          </Card>
          <Card>
            <p className="text-sm text-mute">Design</p>
            <p className="mt-1 font-bold">{template?.name ?? "Default"}</p>
            <p className="mt-1 text-sm text-mute">{b.row?.published_at ? `Last published ${new Date(b.row.published_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}` : "Not published yet. Your store uses the default design."}</p>
            {dirty && <p className="mt-1 text-sm text-sun">You have unpublished changes.</p>}
          </Card>
          <Card data-plan-summary>
            <p className="text-sm text-mute">Plan</p>
            <p className="mt-1 font-bold">{b.access.name} <span className="text-sm font-normal text-mute">{sub?.expires_at ? `· renews or ends ${shortDate(sub.expires_at)}` : user.role === "admin" ? "· included for admins" : "· free, no expiry"}</span></p>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-3">
              <li><b data-templates-open>{openTemplates}</b> designs unlocked, {allTemplates - openTemplates} locked</li>
              <li>{stores.length} of {b.access.storefronts} storefront{b.access.storefronts > 1 ? "s" : ""} in use</li>
              <li>{b.access.layers} effect layers, {featuresOn} of {b.catalog.features.length} design features</li>
            </ul>
            <Link className="mt-2 inline-block text-sm font-semibold text-palm-deep underline" href="/seller/billing">{b.access.level < 2 ? "Compare plans and upgrade" : "Compare plans"}</Link>
          </Card>
        </div>
      )}

      {b && b.publishedIssues.some((v) => v.need) && (
        <Card className="border-sun/50">
          <h2 className="font-bold">Your plan no longer covers part of your design</h2>
          <p className="mt-1 text-sm text-ink-3">Your store still works. Buyers see a simpler version until you pick replacements or upgrade.</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-3">{b.publishedIssues.filter((v) => v.need).map((v) => <li key={v.code}>{v.message}</li>)}</ul>
          <div className="mt-3 flex flex-wrap gap-2"><LinkButton href="/seller/storefront/editor" size="sm">Pick replacements</LinkButton><LinkButton href="/seller/billing" variant="outline" size="sm">Upgrade</LinkButton></div>
        </Card>
      )}
      {b?.hasBackup && (
        <Card>
          <h2 className="font-bold">Your earlier design is saved</h2>
          <p className="mt-1 text-sm text-ink-3">{b.backupReady ? "Your plan covers it again. Restore it with one click." : "It comes back once your plan covers it again."}</p>
          {b.backupReady && <div className="mt-3"><ActionButton action={restoreDesign} variant="primary">Restore earlier design</ActionButton></div>}
        </Card>
      )}

      {b && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["/designs", "Browse designs", `${b.catalog.templates.filter((t) => t.is_active !== false).length} templates, filtered by style and industry.`],
            ["/editor", "Open the editor", "Colours, fonts, banner, effects and sections, with a live preview."],
            ["/media", "Banners and media", "Upload banner images, GIFs, videos and Lottie files."],
            ["/analytics", "Store analytics", "Visits, visitors, product clicks and sales from your store page."]].map(([h, t, d]) => (
            <Link key={h} href={`/seller/storefront${h}`} className="rounded-tag border border-line bg-card p-4 transition hover:border-palm">
              <p className="font-bold">{t}</p><p className="mt-1 text-sm text-mute">{d}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Store details</h2>
          <Form action={saveStorefront} className="space-y-3">
            <Field label="Business name" name="name" defaultValue={s?.name ?? profile?.business_name} />
            <Field label="Tagline" name="tagline" defaultValue={s?.tagline ?? ""} />
            <Field label="About your business" name="description" as="textarea" rows={4} defaultValue={s?.description ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" name="contact_phone" type="tel" defaultValue={s?.contact_phone ?? ""} /><Field label="WhatsApp number" name="contact_whatsapp" type="tel" defaultValue={s?.contact_whatsapp ?? ""} />
              <Field label="Contact email" name="contact_email" type="email" defaultValue={s?.contact_email ?? ""} /><Field label="Where on campus" name="campus_location" defaultValue={s?.campus_location ?? ""} />
            </div>
            <label className="block text-sm font-medium">Logo<ImagePicker name="logo" max={1} multiple={false} /></label>
            <label className="block text-sm font-medium">Cover image (used when you haven't picked a banner)<ImagePicker name="cover" max={1} multiple={false} /></label>
            <Submit>{s ? "Save details" : "Create storefront"}</Submit>
          </Form>
        </Card>
        {s && (
          <Card>
            <h2 className="mb-2 font-bold">Social links, announcement and policies</h2>
            <Form action={saveStoreExtras} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(SOCIAL_HOSTS) as Social[]).map((k) => (
                  <Field key={k} label={SOCIAL_LABEL[k]} name={k} placeholder={`https://${SOCIAL_HOSTS[k]}/...`} defaultValue={s.social_links?.[k] ?? ""} />
                ))}
              </div>
              <Field label="Announcement bar" name="announcement" hint="One line shown across the top of your store." defaultValue={s.announcement ?? ""} />
              <Field label="Store policies" name="policies" as="textarea" rows={4} hint="Returns, refunds, delivery times. Plain text." defaultValue={s.policies ?? ""} />
              <Submit variant="outline">Save</Submit>
            </Form>
          </Card>
        )}
      </div>

      <Card className="max-w-2xl">
        <h2 className="font-bold">Payout account</h2>
        <Form action={saveBank} className="mt-2 space-y-3">
          {banks.length ? (
            <Field label="Bank" name="bank_code" as="select" defaultValue={profile?.bank_code ?? ""}>{banks.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Field>
          ) : (
            <>
              <input type="hidden" name="bank_code" value="manual" />
              <Field label="Bank" name="bank_name" defaultValue={profile?.bank_name ?? ""} />
              <Field label="Account name" name="account_name" defaultValue={profile?.account_name ?? ""} />
            </>
          )}
          <Field label="Account number" name="account_number" inputMode="numeric" defaultValue={profile?.account_number ?? ""} />
          {profile?.account_verified_at && <p className="text-sm text-palm-deep">Confirmed with Paystack: {profile.account_name}</p>}
          <Submit variant="outline">Save payout account</Submit>
        </Form>
      </Card>
    </div>
  );
}
