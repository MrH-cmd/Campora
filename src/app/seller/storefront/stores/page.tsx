import Link from "next/link";
import { createStorefront, moveStorefront, sellerContext, switchStore } from "@/app/actions/seller";
import { ActionButton, Field, Form, Submit } from "@/components/form";
import { Badge, Card, LinkButton, PageHead } from "@/components/ui";
import { StoreTabs } from "../tabs";

export const metadata = { title: "Your storefronts" };
export default async function Stores() {
  const { stores, store, plan } = await sellerContext();
  const full = stores.length >= plan.storefront_limit;
  const paused = stores.filter((s) => !s.within_plan).length;
  return (
    <div>
      <PageHead title="My Storefront" sub={`${stores.length} of ${plan.storefront_limit} storefront${plan.storefront_limit > 1 ? "s" : ""} on ${plan.name}. Each store has its own design, listings, orders, pickup points and earnings.`} />
      {stores.length > 0 && <StoreTabs on="/stores" />}
      {paused > 0 && (
        <Card className="mb-4 border-sun/50">
          <h2 className="font-bold">{paused} storefront{paused > 1 ? "s are" : " is"} paused</h2>
          <p className="mt-1 text-sm text-ink-3">Your plan includes {plan.storefront_limit}. The stores at the top of this list stay live; the rest are hidden from buyers until you upgrade or move them up. Nothing is deleted, and their listings, orders and reviews are all kept.</p>
        </Card>
      )}
      <div className="space-y-2">
        {stores.map((s, i) => (
          <Card key={s.id} className={`flex flex-wrap items-center justify-between gap-3 ${s.id === store?.id ? "border-palm" : ""}`} data-store={s.slug}>
            <div className="min-w-0">
              <p className="font-bold">{i + 1}. {s.name} {s.id === store?.id && <Badge tone="green">Working on</Badge>}</p>
              <p className="mt-0.5 text-sm text-mute">
                {s.status !== "active" ? <span className="text-coral">Hidden by Vybe Market{s.status_reason ? `: ${s.status_reason}` : ""}</span>
                  : s.within_plan ? <span className="text-palm-deep">Live</span> : <span className="text-sun">Paused, over your plan&apos;s limit</span>}
                {" · "}<Link className="underline" href={`/store/${s.slug}`}>/store/{s.slug}</Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {s.id !== store?.id && <ActionButton action={switchStore} values={{ storefront_id: s.id }}>Work on this store</ActionButton>}
              {i > 0 && <ActionButton action={moveStorefront} values={{ storefront_id: s.id, dir: "top" }}>Make main store</ActionButton>}
              {i > 0 && <ActionButton action={moveStorefront} values={{ storefront_id: s.id, dir: "up" }}>Move up</ActionButton>}
              {i < stores.length - 1 && <ActionButton action={moveStorefront} values={{ storefront_id: s.id, dir: "down" }}>Move down</ActionButton>}
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-5 max-w-xl">
        <h2 className="font-bold">Open another storefront</h2>
        {full ? (
          <div className="mt-1 text-sm text-ink-3">
            <p>You&apos;re using all {plan.storefront_limit} storefront{plan.storefront_limit > 1 ? "s" : ""} on {plan.name}. No Dulling includes 3 and Odogwu includes 5.</p>
            <LinkButton href="/seller/billing" size="sm" className="mt-3">See plans</LinkButton>
          </div>
        ) : (
          <Form action={createStorefront} resetOnSuccess className="mt-2 space-y-3">
            <p className="text-sm text-mute">Run a separate brand, like a food business next to your fashion store. Your plan, payout account and listing allowance ({plan.listing_limit} active listings) are shared across all your stores.</p>
            <Field label="Business name" name="name" />
            <Field label="Tagline (optional)" name="tagline" />
            <Submit>Open storefront</Submit>
          </Form>
        )}
      </Card>
    </div>
  );
}
