import Link from "next/link";
import { createCampaign, createCoupon, endCampaign, sellerContext, toggleCoupon } from "@/app/actions/seller";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, Empty, LinkButton, PageHead } from "@/components/ui";
import { asUser } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Promotions" };
export default async function Promotions() {
  const { user, store, plan } = await sellerContext();
  if (!store) return <Empty title="Set up your storefront first" action={<LinkButton href="/seller/storefront">Set up storefront</LinkButton>} />;
  const d = await asUser(user.id, async (db) => ({
    codes: await db.rows("select * from discount_codes where storefront_id=$1 order by created_at desc", [store.id]),
    camps: await db.rows("select * from promotional_campaigns where storefront_id=$1 order by created_at desc limit 20", [store.id]),
  }));
  return (
    <>
      <PageHead title="Promotions" sub="Every plan can set a sale price on a listing. Codes and campaigns unlock on paid plans." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Discount codes</h2>
          {plan.coupons_enabled ? (
            <Form action={createCoupon} resetOnSuccess className="mt-2 space-y-2">
              <div className="grid grid-cols-3 gap-2"><Field label="Code" name="code" /><Field label="% off" name="percent_off" type="number" min={1} max={90} /><Field label="Max uses" name="max_uses" type="number" /></div>
              <Submit size="sm">Create code</Submit>
            </Form>
          ) : <p className="mt-1 text-sm text-mute">Discount codes come with <Link className="underline" href="/seller/billing">No Dulling</Link>.</p>}
          <ul className="mt-3 divide-y divide-line text-sm">{d.codes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span><b>{c.code}</b>, {c.percent_off}% off, used {c.used_count}{c.max_uses ? ` of ${c.max_uses}` : ""}</span><ActionButton action={toggleCoupon} values={{ id: c.id }}>{c.is_active ? "Pause" : "Resume"}</ActionButton></li>
          ))}</ul>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Marketing campaigns</h2>
          <p className="text-sm text-mute">Takes a percentage off your whole storefront for a set time.</p>
          {plan.campaigns_enabled ? (
            <Form action={createCampaign} resetOnSuccess className="mt-2 space-y-2">
              <Field label="Campaign name" name="title" placeholder="Exam week sale" /><Field label="Message" name="body" />
              <div className="grid grid-cols-2 gap-2"><Field label="% off" name="percent_off" type="number" /><Field label="Days" name="days" type="number" defaultValue={7} /></div>
              <Submit size="sm">Launch campaign</Submit>
            </Form>
          ) : <p className="mt-1 text-sm text-mute">Campaigns come with <Link className="underline" href="/seller/billing">Odogwu</Link>.</p>}
          <ul className="mt-3 divide-y divide-line text-sm">{d.camps.map((c) => {
            const live = c.is_active && new Date(c.ends_at) > new Date();
            return <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span>{c.title}, {c.percent_off}% off, ends {shortDate(c.ends_at)}</span>{live ? <ActionButton action={endCampaign} values={{ id: c.id }}>End</ActionButton> : <Badge>Ended</Badge>}</li>;
          })}</ul>
        </Card>
      </div>
    </>
  );
}
