"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action, id, nairaAmount, optional, text } from "@/lib/action";
import { ActionError, requireAdmin } from "@/lib/auth";
import { asSystem, type Db } from "@/lib/db";
import { slugify, toKobo } from "@/lib/format";
import { appUrl } from "@/lib/email";
import { emailUser, ledger, logAdmin, notify } from "@/lib/notify";
import { releaseOrder } from "@/lib/orders";
import { providers, transfers, type ProviderName } from "@/lib/payments/providers";
import { settlePayout } from "@/lib/payments/payouts";
import { issueRewards, reverseReferral } from "@/lib/referrals";

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

export const reviewVerification = action(z.object({ id, decision: z.enum(["approved", "rejected", "needs_info", "note"]), note }), async (d) => {
  const a = await requireAdmin();
  if (["rejected", "needs_info"].includes(d.decision) && !d.note) throw new ActionError("Add a reason so the student knows what to fix.");
  const r = await asSystem(async (db) => {
    await db.run("insert into verification_reviews(verification_id,admin_id,decision,reason) values ($1,$2,$3,$4)", [d.id, a.id, d.decision, d.note]);
    await logAdmin(db, a.id, `student.${d.decision}`, "verification", d.id);
    if (d.decision === "note") { await db.run("update student_verifications set internal_note=$2 where id=$1", [d.id, d.note]); return null; }
    const v = await db.one("update student_verifications set status=$2::review_state, review_note=$3, reviewed_by=$4, reviewed_at=now() where id=$1 and (status='pending' or (status='approved' and $2::text='rejected')) returning user_id", [d.id, d.decision, d.note, a.id]);
    if (!v) throw new ActionError("This request was already reviewed.");
    const next = d.decision === "approved" ? "verified" : d.decision === "rejected" ? "rejected" : "resubmit";
    await db.run("update users set student_status=$2 where id=$1", [v.user_id, next]);
    const title = d.decision === "approved" ? "You're a verified student" : d.decision === "rejected" ? "Student verification declined" : "We need more from you";
    await notify(db, v.user_id, title, d.note, "/account/verification");
    return { user: v.user_id, title };
  });
  if (r) await emailUser(r.user, r.title, `${d.note ?? "Your student status is confirmed."}\n\n${appUrl("/account/verification")}`);
  revalidatePath("/admin", "layout");
  return d.decision === "approved" ? "Student verified." : d.decision === "rejected" ? "Request declined." : d.decision === "note" ? "Note saved." : "Sent back to the student.";
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

export const saveCategory = admin(z.object({ id: z.string().optional(), name: text(2, 60, "Name"), kind: z.enum(["product", "service"]), is_active: z.string().optional(), commission_percent: z.string().optional() }), "category.save", async (d, db) => {
  const bps = d.commission_percent ? Math.round(Number(d.commission_percent) * 100) : null;
  if (bps !== null && !(bps >= 0 && bps <= 5000)) throw new ActionError("Commission must be between 0 and 50%.");
  if (d.id) await db.run("update categories set name=$2, kind=$3, is_active=$4, commission_bps=$5 where id=$1", [d.id, d.name, d.kind, d.is_active === "on", bps]);
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
  await notify(db, o.buyer_id, `Dispute on ${o.number} closed`, d.resolution, `/account/orders/${o.id}`);
  await notify(db, o.owner_id, `Dispute on ${o.number} closed`, d.resolution, `/seller/orders/${o.id}`);
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
    const o = await db.one("select buyer_id, number, storefront_id from orders where id=$1", [r.order_id]);
    const c = await db.one("update commissions set status='reversed' where order_id=$1 and status<>'reversed' returning commission_kobo, net_kobo", [r.order_id]);
    await ledger(db, `refund:${d.id}`, "refund", -Number(r.amount_kobo), { orderId: r.order_id, storefrontId: o.storefront_id, transactionId: r.transaction_id });
    if (c) {
      await ledger(db, `commission-reversal:${r.order_id}`, "commission_reversal", -Number(c.commission_kobo), { orderId: r.order_id, storefrontId: o.storefront_id });
      await ledger(db, `earning-reversal:${r.order_id}`, "seller_earning_reversal", -Number(c.net_kobo), { orderId: r.order_id, storefrontId: o.storefront_id });
    }
    await releaseOrder(db, r.order_id);
    await reverseReferral(db, r.order_id);
    const left = await db.one("select count(*)::int n from orders where transaction_id=$1 and payment_status<>'refunded'", [r.transaction_id]);
    if (left.n === 0) await db.run("update transactions set status='refunded' where id=$1", [r.transaction_id]);
    await notify(db, o.buyer_id, `Refund sent for ${o.number}`, null, `/account/orders/${r.order_id}`);
    await logAdmin(db, a.id, "refund.process", "refund", d.id, { providerRef });
  });
  revalidatePath("/admin", "layout");
  return "Refund sent to the provider.";
});

/** Sends a requested payout through Paystack. It only becomes paid once Paystack confirms it. */
export const sendPayout = action(z.object({ id }), async (d) => {
  const a = await requireAdmin();
  if (!transfers.configured()) throw new ActionError("Paystack isn't set up, so payouts can't be sent.");
  const reference = `payout_${d.id.replace(/-/g, "")}`;
  const p = await asSystem(async (db) => {
    const row = await db.one(
      `update seller_payouts p set status='processing', transfer_reference=$2, processed_by=$3 from storefronts s
       where p.id=$1 and p.status='requested' and s.id=p.storefront_id returning p.amount_kobo, s.owner_id, s.name`, [d.id, reference, a.id]);
    if (!row) throw new ActionError("This payout was already handled.");
    const sp = await db.one("select paystack_recipient_code from seller_profiles where user_id=$1", [row.owner_id]);
    if (!sp?.paystack_recipient_code) { await db.run("update seller_payouts set status='requested' where id=$1", [d.id]); return null; }
    await logAdmin(db, a.id, "payout.send", "payout", d.id);
    return { ...row, recipient: sp.paystack_recipient_code };
  });
  if (!p) throw new ActionError("This seller's payout account hasn't been confirmed with Paystack.");
  try {
    const t = await transfers.send({ amountKobo: Number(p.amount_kobo), recipient: p.recipient, reference, reason: `Vybe Market payout: ${p.name}` });
    await asSystem((db) => db.run("update seller_payouts set transfer_code=$2 where id=$1", [d.id, t.transfer_code]));
  } catch (e) {
    await asSystem((db) => db.run("update seller_payouts set status='failed' where id=$1", [d.id]));
    throw new ActionError(`Paystack refused the transfer: ${(e as Error).message}`);
  }
  await settlePayout(reference);
  revalidatePath("/admin", "layout");
  return "Transfer sent. It will show as paid once Paystack confirms it.";
});

export const checkPayout = action(z.object({ id }), async (d) => {
  await requireAdmin();
  const p = await asSystem((db) => db.one("select transfer_reference from seller_payouts where id=$1", [d.id]));
  if (!p?.transfer_reference) throw new ActionError("No transfer on this payout.");
  await settlePayout(p.transfer_reference);
  revalidatePath("/admin", "layout");
  return "Checked with Paystack.";
});

export const processPayout = admin(z.object({ id, decision: z.enum(["paid", "rejected"]), bank_reference: optional(80), note }), "payout.process", async (d, db, me) => {
  if (d.decision === "paid" && !d.bank_reference) throw new ActionError("Enter the bank transfer reference first.");
  if (d.decision === "paid" && transfers.configured()) throw new ActionError("Paystack is set up, so send this payout through Paystack.");
  const p = await db.one(
    `update seller_payouts p set status=$2, bank_reference=$3, note=$4, processed_by=$5, processed_at=now()
     from storefronts s where p.id=$1 and p.status='requested' and s.id=p.storefront_id returning s.owner_id, p.amount_kobo, p.storefront_id`, [d.id, d.decision, d.bank_reference, d.note, me]);
  if (!p) throw new ActionError("This payout was already handled.");
  if (d.decision === "paid") await ledger(db, `payout:${d.id}`, "seller_payout", -Number(p.amount_kobo), { storefrontId: p.storefront_id, memo: d.bank_reference ?? undefined });
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
  deletion_grace_days: z.coerce.number().int().min(0).max(60), selling_requires_student: z.string().optional(), auto_approve_students: z.string().optional(),
}), "settings.save", async (d, db) => {
  const put = (k: string, v: unknown) => db.run(
    "insert into platform_settings(key,value) values ($1,$2) on conflict (key) do update set value=$2, updated_at=now()", [k, JSON.stringify(v)]);
  await put("commission_bps", Math.round(d.commission_percent * 100));
  await put("pay_on_pickup_enabled", d.pay_on_pickup_enabled === "on");
  await put("require_listing_review", d.require_listing_review === "on");
  await put("deletion_grace_days", d.deletion_grace_days);
  await put("selling_requires_student", d.selling_requires_student === "on");
  await put("auto_approve_students", d.auto_approve_students === "on");
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
  if (d.href && !d.href.startsWith("/")) throw new ActionError("Links must start with / and stay on Vybe Market.");
  await db.run("insert into promotional_campaigns(title,body,href,is_sponsored,ends_at) values ($1,$2,$3,$4, now()+make_interval(days=>$5))", [d.title, d.body, d.href, d.is_sponsored === "on", d.days]);
  return "Campaign published.";
});

export const stopCampaign = admin(z.object({ id }), "campaign.stop", async (d, db) => {
  await db.run("update promotional_campaigns set is_active=false where id=$1", [d.id]);
  return "Campaign stopped.";
});

const dt = (v?: string | null) => (v ? new Date(`${v}:00+01:00`) : null); // Form dates are Lagos time.
const emails = (s?: string | null) => (s ?? "").split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
const uuids = (s?: string | null) => { const l = (s ?? "").split(/[\s,]+/).filter(Boolean); if (l.some((x) => !id.safeParse(x).success)) throw new ActionError("Check the IDs you selected."); return l; };

const discountSchema = z.object({
  id: z.string().optional(), name: text(2, 80, "Discount name"), description: optional(300), mode: z.enum(["code", "automatic"]), code: optional(30),
  discount_type: z.enum(["percentage", "fixed"]), value: z.coerce.number({ error: "Enter a value" }).positive("Enter a value"),
  maximum_discount: z.string().optional(), minimum_order: z.string().optional(), usage_limit: z.string().optional(), per_user_limit: z.coerce.number().int().min(1).default(1),
  user_scope: z.enum(["all", "new_users", "first_time", "selected"]), new_user_days: z.coerce.number().int().min(1).max(365).default(30), selected_users: optional(4000),
  listings: optional(4000), categories: z.string().optional(), storefronts: optional(4000),
  funding_source: z.enum(["platform", "seller", "shared"]), seller_share_percent: z.coerce.number().int().min(0).max(100).default(0), seller_agreement_ref: optional(120),
  stackable: z.string().optional(), starts_at: z.string().optional(), expires_at: z.string().optional(), intent: z.enum(["draft", "active"]),
});

export const saveDiscount = action(discountSchema, async (d, form) => {
  const a = await requireAdmin();
  const code = d.mode === "code" ? d.code?.toUpperCase().replace(/\s/g, "") : null;
  if (d.mode === "code" && !code) throw new ActionError("Enter a discount code, or make it automatic.");
  if (d.discount_type === "percentage" && d.value > 100) throw new ActionError("A percentage can't be above 100.");
  const value = d.discount_type === "percentage" ? Math.round(d.value) : toKobo(d.value);
  const stores = uuids(d.storefronts);
  if (d.funding_source !== "platform" && (!stores.length || !d.seller_agreement_ref)) throw new ActionError("Seller-funded discounts need the seller stores and the agreement reference.");
  const start = dt(d.starts_at) ?? new Date(); const end = dt(d.expires_at);
  if (end && end <= start) throw new ActionError("The end date must be after the start date.");
  const cats = (form.getAll("categories") as string[]).filter(Boolean);
  const vals = [d.name, d.description, code, d.mode === "automatic", d.discount_type, value, d.maximum_discount ? toKobo(d.maximum_discount) : null, d.minimum_order ? toKobo(d.minimum_order) : 0,
    d.user_scope, d.new_user_days, emails(d.selected_users), uuids(d.listings), cats, stores, d.funding_source, d.funding_source === "shared" ? d.seller_share_percent : 0, d.seller_agreement_ref,
    d.stackable === "on", start, end, d.usage_limit ? Number(d.usage_limit) : null, d.per_user_limit, d.intent];
  await asSystem(async (db) => {
    if (code) {
      const clash = await db.one("select 1 from discount_campaigns where upper(code)=$1 and id::text<>$2", [code, d.id ?? ""]);
      if (clash) throw new ActionError("That code is already in use.");
    }
    if (d.id) {
      const used = await db.one("select count(*)::int n from discount_redemptions where campaign_id=$1", [d.id]);
      if (used.n) { // Terms already used by customers stay fixed; only reach and timing can change.
        await db.run("update discount_campaigns set name=$2, description=$3, user_scope=$4, selected_user_emails=$5, expires_at=$6, usage_limit=$7, per_user_limit=$8, updated_at=now() where id=$1",
          [d.id, d.name, d.description, d.user_scope, emails(d.selected_users), end, vals[20], d.per_user_limit]);
      } else {
        await db.run(`update discount_campaigns set name=$2,description=$3,code=$4,is_automatic=$5,discount_type=$6,discount_value=$7,maximum_discount_kobo=$8,minimum_order_kobo=$9,user_scope=$10,new_user_days=$11,selected_user_emails=$12,
          target_listing_ids=$13,target_category_ids=$14,target_storefront_ids=$15,funding_source=$16,seller_share_percent=$17,seller_agreement_ref=$18,stackable=$19,starts_at=$20,expires_at=$21,usage_limit=$22,per_user_limit=$23,status=$24,updated_at=now() where id=$1`, [d.id, ...vals]);
      }
    } else {
      await db.run(`insert into discount_campaigns(name,description,code,is_automatic,discount_type,discount_value,maximum_discount_kobo,minimum_order_kobo,user_scope,new_user_days,selected_user_emails,
        target_listing_ids,target_category_ids,target_storefront_ids,funding_source,seller_share_percent,seller_agreement_ref,stackable,starts_at,expires_at,usage_limit,per_user_limit,status,created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`, [...vals, a.id]);
    }
    await logAdmin(db, a.id, "discount.save", "discount", d.id ?? d.name, { value, funding: d.funding_source });
  });
  revalidatePath("/admin", "layout");
  redirect("/admin/discounts?tab=all");
});

export const setDiscountStatus = admin(z.object({ id, status: z.enum(["active", "paused", "archived"]) }), "discount.status", async (d, db) => {
  await db.run("update discount_campaigns set status=$2, updated_at=now() where id=$1", [d.id, d.status]);
  return `Discount ${d.status === "active" ? "resumed" : d.status}.`;
});

export const deleteDiscount = admin(z.object({ id }), "discount.delete", async (d, db) => {
  const n = await db.run("delete from discount_campaigns c where id=$1 and status='draft' and not exists (select 1 from discount_redemptions r where r.campaign_id=c.id)", [d.id]);
  if (!n) throw new ActionError("Only unused drafts can be deleted. Archive this one instead.");
  return "Draft deleted.";
});

export const saveReferralSettings = admin(z.object({
  enabled: z.string().optional(), suspended: z.string().optional(), period_days: z.coerce.number().int().min(1).max(365), reward_type: z.enum(["fixed", "percentage"]),
  referrer_reward: z.coerce.number().min(0), referred_reward: z.coerce.number().min(0), percentage_cap: z.string().optional(), recipients: z.enum(["referrer", "referred", "both"]),
  max_referrals: z.coerce.number().int().min(1).max(1000), minimum_order: z.coerce.number().min(0), reward_expiry_days: z.coerce.number().int().min(1).max(730),
}), "referral.settings", async (d, db) => {
  const conv = (v: number) => (d.reward_type === "fixed" ? toKobo(v) : Math.round(v));
  if (d.enabled === "on" && conv(d.referrer_reward) + conv(d.referred_reward) <= 0) throw new ActionError("Set a reward amount before switching the programme on.");
  await db.run(`update referral_program_settings set enabled=$1,suspended=$2,period_days=$3,reward_type=$4,referrer_reward=$5,referred_reward=$6,percentage_cap_kobo=$7,recipients=$8,max_referrals=$9,minimum_order_kobo=$10,reward_expiry_days=$11,updated_at=now()`,
    [d.enabled === "on", d.suspended === "on", d.period_days, d.reward_type, conv(d.referrer_reward), conv(d.referred_reward), d.percentage_cap ? toKobo(d.percentage_cap) : null, d.recipients, d.max_referrals, toKobo(d.minimum_order), d.reward_expiry_days]);
  return "Referral settings saved.";
});

export const reviewReferral = admin(z.object({ id, decision: z.enum(["approve", "reject"]), reason: note }), "referral.review", async (d, db, me) => {
  const r = await db.one("select * from referrals where id=$1 for update", [d.id]);
  if (!r || ["reward_issued", "rejected"].includes(r.status)) throw new ActionError("This referral was already decided.");
  await db.run("update referrals set reviewed_by=$2, reviewed_at=now() where id=$1", [d.id, me]);
  if (d.decision === "reject") {
    await db.run("update referrals set status='rejected', rejection_reason=$2 where id=$1", [d.id, d.reason ?? "Rejected after review"]);
    return "Referral rejected.";
  }
  if (r.qualifying_order_id) { await db.run("update referrals set status='successful' where id=$1", [d.id]); await issueRewards(db, d.id); return "Reward issued."; }
  await db.run("update referrals set status='pending_purchase' where id=$1", [d.id]);
  return "Referral cleared. It will pay out after a qualifying purchase.";
});
