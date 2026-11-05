"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, id, nairaAmount, optional, text } from "@/lib/action";
import { ActionError, requireAdmin } from "@/lib/auth";
import { asSystem, type Db } from "@/lib/db";
import { slugify, toKobo } from "@/lib/format";
import { logAdmin, notify } from "@/lib/notify";
import { providers, type ProviderName } from "@/lib/payments/providers";

/** Every admin mutation runs through here: authorise on the server, do the work, write the audit log. */
function admin<S extends z.ZodType>(schema: S, name: string, fn: (d: z.output<S>, db: Db, adminId: string) => Promise<string | void>) {
  return action(schema, async (d) => {
    const a = await requireAdmin();
    const message = await asSystem(async (db) => {
      const m = await fn(d, db, a.id);
      await logAdmin(db, a.id, name, "platform", String((d as any).id ?? (d as any).user_id ?? ""), d as object);
      return m;
    });
    revalidatePath("/admin", "layout");
    return message ?? "Saved.";
  });
}

const note = optional(400);

export const setUserStatus = admin(z.object({ user_id: id, status: z.enum(["active", "restricted", "suspended"]), reason: note }), "user.status", async (d, db, me) => {
  if (d.user_id === me) throw new ActionError("You can't change your own account status.");
  await db.run("update users set status=$2, status_reason=$3 where id=$1", [d.user_id, d.status, d.reason]);
  if (d.status === "suspended") {
    await db.run("delete from sessions where user_id=$1", [d.user_id]);
    await db.run("update storefronts set status='suspended' where owner_id=$1", [d.user_id]);
  } else {
    await db.run("update storefronts set status='active' where owner_id=$1 and status='suspended'", [d.user_id]);
  }
  await notify(db, d.user_id, `Your account is now ${d.status}`, d.reason, "/account");
  return `Account ${d.status}.`;
});

export const reviewVerification = admin(z.object({ id, decision: z.enum(["approved", "rejected"]), note }), "student.review", async (d, db, me) => {
  const v = await db.one("update student_verifications set status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now() where id=$1 and status='pending' returning user_id", [d.id, d.decision, d.note, me]);
  if (!v) throw new ActionError("This request was already reviewed.");
  await db.run("update users set student_status=$2 where id=$1", [v.user_id, d.decision === "approved" ? "verified" : "rejected"]);
  await notify(db, v.user_id, d.decision === "approved" ? "You're verified" : "Student verification declined", d.note, "/account/verification");
  return d.decision === "approved" ? "Student verified." : "Request declined.";
});

export const reviewSeller = admin(z.object({ user_id: id, decision: z.enum(["approved", "rejected"]), note }), "seller.review", async (d, db, me) => {
  const s = await db.one("update seller_profiles set status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now() where user_id=$1 and status='pending' returning user_id", [d.user_id, d.decision, d.note, me]);
  if (!s) throw new ActionError("This application was already reviewed.");
  if (d.decision === "approved") {
    await db.run("update users set role='seller' where id=$1 and role='customer'", [d.user_id]);
    await db.run(`insert into subscriptions(seller_id, plan_id) select $1, id from subscription_plans order by sort limit 1 on conflict do nothing`, [d.user_id]);
  }
  await notify(db, d.user_id, d.decision === "approved" ? "You're approved to sell" : "Seller application declined", d.note ?? (d.decision === "approved" ? "Set up your storefront to start." : null), d.decision === "approved" ? "/seller/storefront" : "/account/become-seller");
  return d.decision === "approved" ? "Seller approved." : "Application declined.";
});

export const moderateListing = admin(z.object({ id, decision: z.enum(["approve", "reject", "remove"]), note }), "listing.moderate", async (d, db) => {
  const next = { approve: "active", reject: "rejected", remove: "removed" }[d.decision];
  const l = await db.one(
    `update listings l set status=$2::listing_status, moderation_note=$3, approved_at = case when $2::text='active' then now() else approved_at end
     from storefronts s where l.id=$1 and s.id=l.storefront_id returning l.title, s.owner_id, l.id`, [d.id, next, d.note]);
  if (!l) throw new ActionError("Listing not found.");
  await notify(db, l.owner_id, `"${l.title}" was ${d.decision === "approve" ? "approved" : next}`, d.note, `/seller/listings/${l.id}`);
  return `Listing ${next === "active" ? "approved" : next}.`;
});

export const saveCategory = admin(z.object({ id: z.string().optional(), name: text(2, 60, "Name"), kind: z.enum(["product", "service"]), is_active: z.string().optional() }), "category.save", async (d, db) => {
  if (d.id) await db.run("update categories set name=$2, kind=$3, is_active=$4 where id=$1", [d.id, d.name, d.kind, d.is_active === "on"]);
  else await db.run("insert into categories(slug,name,kind) values ($1,$2,$3) on conflict do nothing", [slugify(d.name), d.name, d.kind]);
  return "Category saved.";
});

export const resolveReport = admin(z.object({ id, status: z.enum(["resolved", "dismissed"]), resolution: note }), "report.resolve", async (d, db, me) => {
  await db.run("update reports set status=$2, resolution=$3, handled_by=$4, handled_at=now() where id=$1", [d.id, d.status, d.resolution, me]);
  return `Report ${d.status}.`;
});

export const resolveDispute = admin(z.object({ id, status: z.enum(["resolved_buyer", "resolved_seller", "closed"]), resolution: text(3, 800, "Resolution") }), "dispute.resolve", async (d, db, me) => {
  const row = await db.one("update disputes set status=$2, resolution=$3, handled_by=$4, handled_at=now() where id=$1 and status='open' returning order_id", [d.id, d.status, d.resolution, me]);
  if (!row) throw new ActionError("This dispute is already closed.");
  const o = await db.one("select o.*, s.owner_id from orders o join storefronts s on s.id=o.storefront_id where o.id=$1", [row.order_id]);
  if (d.status === "resolved_buyer" && o.payment_status === "paid") {
    await db.run("insert into refunds(order_id,transaction_id,amount_kobo,reason) values ($1,$2,$3,$4) on conflict do nothing", [o.id, o.transaction_id, o.total_kobo, `Dispute: ${d.resolution}`]);
  }
  for (const u of [o.buyer_id, o.owner_id]) await notify(db, u, `Dispute on ${o.number} closed`, d.resolution, `/account/orders/${o.id}`);
  return "Dispute closed.";
});

export const processRefund = action(z.object({ id, decision: z.enum(["process", "reject"]), note }), async (d) => {
  const a = await requireAdmin();
  const r = await asSystem((db) => db.one(
    `select r.*, t.reference, t.provider, t.provider_reference, t.status as tx_status from refunds r left join transactions t on t.id=r.transaction_id where r.id=$1 and r.status='requested'`, [d.id]));
  if (!r) throw new ActionError("This refund was already handled.");
  if (d.decision === "reject") {
    await asSystem(async (db) => {
      await db.run("update refunds set status='rejected', note=$2, processed_by=$3, processed_at=now() where id=$1", [d.id, d.note, a.id]);
      await logAdmin(db, a.id, "refund.reject", "refund", d.id);
    });
    return "Refund rejected.";
  }
  if (!r.provider || r.tx_status !== "success") throw new ActionError("There's no verified payment to refund against.");
  const p = providers[r.provider as ProviderName];
  if (!p.configured()) throw new ActionError(`${r.provider} isn't set up, so this refund can't be sent.`);
  const providerRef = await p.refund({ reference: r.reference, providerReference: r.provider_reference, amountKobo: Number(r.amount_kobo) });
  await asSystem(async (db) => {
    await db.run("update refunds set status='processed', provider_reference=$2, note=$3, processed_by=$4, processed_at=now() where id=$1", [d.id, providerRef, d.note, a.id]);
    await db.run("update orders set payment_status='refunded' where id=$1", [r.order_id]);
    await db.run("update commissions set status='reversed' where order_id=$1", [r.order_id]);
    const left = await db.one("select count(*)::int n from orders where transaction_id=$1 and payment_status<>'refunded'", [r.transaction_id]);
    if (left.n === 0) await db.run("update transactions set status='refunded' where id=$1", [r.transaction_id]);
    const o = await db.one("select buyer_id, number from orders where id=$1", [r.order_id]);
    await notify(db, o.buyer_id, `Refund sent for ${o.number}`, null, `/account/orders/${r.order_id}`);
    await logAdmin(db, a.id, "refund.process", "refund", d.id, { providerRef });
  });
  revalidatePath("/admin", "layout");
  return "Refund sent to the provider.";
});

export const processPayout = admin(z.object({ id, decision: z.enum(["paid", "rejected"]), bank_reference: optional(80), note }), "payout.process", async (d, db, me) => {
  if (d.decision === "paid" && !d.bank_reference) throw new ActionError("Enter the bank transfer reference first.");
  const p = await db.one(
    `update seller_payouts p set status=$2, bank_reference=$3, note=$4, processed_by=$5, processed_at=now()
     from storefronts s where p.id=$1 and p.status='requested' and s.id=p.storefront_id returning s.owner_id`, [d.id, d.decision, d.bank_reference, d.note, me]);
  if (!p) throw new ActionError("This payout was already handled.");
  await notify(db, p.owner_id, d.decision === "paid" ? "Payout sent" : "Payout declined", d.note, "/seller/earnings");
  return d.decision === "paid" ? "Payout recorded as paid." : "Payout rejected.";
});

export const savePlan = admin(z.object({
  id, price: z.string().optional(), listing_limit: z.coerce.number().int().min(1).max(10000), photo_limit: z.coerce.number().int().min(1).max(50),
  monthly_boost_credits: z.coerce.number().int().min(0).max(1000),
}), "plan.save", async (d, db) => {
  const price = d.price === "" || d.price == null ? null : toKobo(nairaAmount.parse(d.price));
  await db.run("update subscription_plans set price_kobo=$2, listing_limit=$3, photo_limit=$4, monthly_boost_credits=$5 where id=$1", [d.id, price, d.listing_limit, d.photo_limit, d.monthly_boost_credits]);
  return "Plan saved.";
});

export const saveSettings = admin(z.object({
  commission_percent: z.coerce.number().min(0).max(50), pay_on_pickup_enabled: z.string().optional(), require_listing_review: z.string().optional(),
}), "settings.save", async (d, db) => {
  const put = (k: string, v: unknown) => db.run(
    "insert into platform_settings(key,value) values ($1,$2) on conflict (key) do update set value=$2, updated_at=now()", [k, JSON.stringify(v)]);
  await put("commission_bps", Math.round(d.commission_percent * 100));
  await put("pay_on_pickup_enabled", d.pay_on_pickup_enabled === "on");
  await put("require_listing_review", d.require_listing_review === "on");
  return "Settings saved.";
});

export const saveBoostPackage = admin(z.object({
  id: z.string().optional(), name: text(2, 60, "Name"), placement: z.enum(["homepage_featured", "search_priority", "storefront_promoted"]),
  duration_days: z.coerce.number().int().min(1).max(90), price: z.string().optional(), credit_cost: z.coerce.number().int().min(0).max(100), is_active: z.string().optional(),
}), "boost.save", async (d, db) => {
  const price = d.price ? toKobo(d.price) : null;
  if (d.id) await db.run("update boost_packages set name=$2,placement=$3,duration_days=$4,price_kobo=$5,credit_cost=$6,is_active=$7 where id=$1", [d.id, d.name, d.placement, d.duration_days, price, d.credit_cost, d.is_active === "on"]);
  else await db.run("insert into boost_packages(name,placement,duration_days,price_kobo,credit_cost) values ($1,$2,$3,$4,$5)", [d.name, d.placement, d.duration_days, price, d.credit_cost]);
  return "Boost package saved.";
});

export const saveUniversity = admin(z.object({
  id: z.string().optional(), name: text(3, 120, "Name"), short_name: text(2, 30, "Short name"), city: optional(60), state: optional(60),
  verification_methods: z.string(), student_email_domains: z.string().optional(), pickup_points: z.string().optional(), is_active: z.string().optional(),
}), "university.save", async (d, db) => {
  const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const methods = list(d.verification_methods);
  if (!methods.length || methods.some((m) => !["student_email", "id_upload"].includes(m))) throw new ActionError("Methods must be student_email, id_upload or both.");
  if (d.id) await db.run(
    `update universities set name=$2,short_name=$3,city=$4,state=$5,verification_methods=$6,student_email_domains=$7,pickup_points=$8,is_active=$9 where id=$1`,
    [d.id, d.name, d.short_name, d.city, d.state, methods, list(d.student_email_domains), list(d.pickup_points), d.is_active === "on"]);
  else await db.run(
    `insert into universities(name,short_name,slug,city,state,verification_methods,student_email_domains,pickup_points) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [d.name, d.short_name, slugify(d.short_name), d.city, d.state, methods, list(d.student_email_domains), list(d.pickup_points)]);
  return "University saved.";
});

export const saveCampaign = admin(z.object({
  title: text(3, 80, "Title"), body: optional(160), href: optional(200), days: z.coerce.number().int().min(1).max(365), is_sponsored: z.string().optional(),
}), "campaign.create", async (d, db) => {
  if (d.href && !d.href.startsWith("/")) throw new ActionError("Links must start with / and stay on Campora.");
  await db.run("insert into promotional_campaigns(title,body,href,is_sponsored,ends_at) values ($1,$2,$3,$4, now()+make_interval(days=>$5))", [d.title, d.body, d.href, d.is_sponsored === "on", d.days]);
  return "Campaign published.";
});

export const stopCampaign = admin(z.object({ id }), "campaign.stop", async (d, db) => {
  await db.run("update promotional_campaigns set is_active=false where id=$1", [d.id]);
  return "Campaign stopped.";
});
