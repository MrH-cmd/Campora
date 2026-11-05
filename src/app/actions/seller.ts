"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { action, id, nairaAmount, optional, text } from "@/lib/action";
import { ActionError, rateLimit, requireSeller } from "@/lib/auth";
import { asSystem, asUser, type Db } from "@/lib/db";
import { slugify, toKobo } from "@/lib/format";
import { changeOrderStatus } from "@/lib/orders";
import { beginPayment, newReference } from "@/lib/payments/settle";
import { getProvider } from "@/lib/payments/providers";
import { getSetting } from "@/lib/settings";
import { saveImage } from "@/lib/storage";

export async function sellerContext() {
  const user = await requireSeller();
  const data = await asUser(user.id, async (db) => ({
    store: await db.one("select * from storefronts where owner_id=$1", [user.id]),
    plan: await db.one("select * from effective_plan($1)", [user.id]),
  }));
  return { user, ...data };
}

async function activeStore() {
  const ctx = await sellerContext();
  if (!ctx.store) throw new ActionError("Create your storefront first.");
  if (ctx.user.status !== "active") throw new ActionError("Your account is restricted, so selling is paused.");
  return ctx as typeof ctx & { store: any };
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();

export const saveStorefront = action(z.object({
  name: text(2, 80, "Business name"), tagline: optional(120), description: optional(1500),
  contact_phone: optional(20), contact_whatsapp: optional(20), contact_email: optional(120), campus_location: optional(120),
  accent: hex, layout: z.enum(["grid", "editorial"]).optional(), announcement: optional(160),
}), async (d, form) => {
  const { user, store, plan } = await sellerContext();
  const logo = form.get("logo") as File | null;
  const cover = form.get("cover") as File | null;
  const logoPath = logo?.size ? await saveImage(logo, "logos", user.id) : null;
  const coverPath = cover?.size ? await saveImage(cover, "covers", user.id) : null;
  // Plan features are decided here on the server, whatever the form sent.
  const accent = plan.customization_level >= 1 && d.accent ? d.accent : store?.accent ?? "#0B8F5A";
  const announcement = plan.customization_level >= 1 ? d.announcement : store?.announcement ?? null;
  const layout = plan.customization_level >= 2 && d.layout ? d.layout : store?.layout ?? "grid";
  await asUser(user.id, async (db) => {
    if (!store) {
      const slug = `${slugify(d.name)}-${randomBytes(2).toString("hex")}`;
      await db.run(
        `insert into storefronts(owner_id,university_id,slug,name,tagline,description,contact_phone,contact_whatsapp,contact_email,campus_location)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [user.id, user.university_id, slug, d.name, d.tagline, d.description, d.contact_phone, d.contact_whatsapp, d.contact_email, d.campus_location]);
    }
    await db.run(
      `update storefronts set name=$2,tagline=$3,description=$4,contact_phone=$5,contact_whatsapp=$6,contact_email=$7,campus_location=$8,
         accent=$9,layout=$10,announcement=$11,logo_path=coalesce($12,logo_path),cover_path=coalesce($13,cover_path) where owner_id=$1`,
      [user.id, d.name, d.tagline, d.description, d.contact_phone, d.contact_whatsapp, d.contact_email, d.campus_location, accent, layout, announcement, logoPath, coverPath]);
  });
  revalidatePath("/seller");
  return "Storefront saved.";
});

const listingSchema = z.object({
  id: id.optional().or(z.literal("").transform(() => undefined)),
  kind: z.enum(["product", "service"]), title: text(3, 120, "Title"), description: text(10, 3000, "Description"),
  category_id: id, price: nairaAmount, sale_price: z.string().optional(), intent: z.enum(["draft", "publish"]),
  stock: z.coerce.number().int().min(0).max(100000).optional(), item_condition: z.enum(["new", "like_new", "used", "handmade"]).optional(),
  price_type: z.enum(["fixed", "starting_from"]).optional(), availability: optional(160), turnaround: optional(80),
  is_available: z.string().optional(),
});

async function addImages(db: Db, listingId: string, files: File[], ownerId: string) {
  const paths: string[] = [];
  for (const f of files) paths.push(await saveImage(f, "listings", ownerId));
  const base = (await db.one("select coalesce(max(position),-1)+1 as p from listing_images where listing_id=$1", [listingId])).p;
  for (const [i, path] of paths.entries())
    await db.run("insert into listing_images(listing_id,path,position) values ($1,$2,$3)", [listingId, path, base + i]);
}

export const saveListing = action(listingSchema, async (d, form) => {
  const { user, store } = await activeStore();
  const files = (form.getAll("images") as File[]).filter((f) => f.size);
  const sale = d.sale_price ? toKobo(d.sale_price) : null;
  const review = await asSystem((db) => getSetting(db, "require_listing_review", true));
  const listingId = await asUser(user.id, async (db) => {
    let lid = d.id;
    const existing = lid ? await db.one("select * from listings where id=$1 and storefront_id=$2", [lid, store.id]) : null;
    if (lid && !existing) throw new ActionError("Listing not found.");
    const approved = !!existing?.approved_at;
    const status = d.intent === "draft" ? (existing?.status === "active" ? "inactive" : existing?.status ?? "draft")
      : review && !approved ? "pending_review" : "active";
    if (existing) {
      await db.run("update listings set title=$2,description=$3,category_id=$4,price_kobo=$5,sale_price_kobo=$6,status=$7 where id=$1",
        [lid, d.title, d.description, d.category_id, toKobo(d.price), sale, status]);
    } else {
      const slug = `${slugify(d.title)}-${randomBytes(3).toString("hex")}`;
      const row = await db.one(
        `insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,sale_price_kobo,status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [store.id, d.category_id, d.kind, slug, d.title, d.description, toKobo(d.price), sale, status]);
      lid = row.id as string;
    }
    if (d.kind === "product") {
      await db.run(`insert into products(listing_id,stock,item_condition) values ($1,$2,$3)
        on conflict (listing_id) do update set stock=$2,item_condition=$3`, [lid, d.stock ?? 0, d.item_condition ?? "new"]);
    } else {
      await db.run(`insert into services(listing_id,price_type,availability,turnaround,is_available) values ($1,$2,$3,$4,$5)
        on conflict (listing_id) do update set price_type=$2,availability=$3,turnaround=$4,is_available=$5`,
        [lid, d.price_type ?? "fixed", d.availability, d.turnaround, d.is_available !== "off"]);
    }
    await addImages(db, lid!, files, user.id);
    return lid!;
  });
  revalidatePath("/seller/listings");
  redirect(`/seller/listings/${listingId}?saved=1`);
});

export const setListingActive = action(z.object({ id, active: z.enum(["1", "0"]) }), async (d) => {
  const { user } = await activeStore();
  const review = await asSystem((db) => getSetting(db, "require_listing_review", true));
  const msg = await asUser(user.id, async (db) => {
    const l = await db.one("select status, approved_at from listings where id=$1", [d.id]);
    if (!l) throw new ActionError("Listing not found.");
    if (d.active === "0") { await db.run("update listings set status='inactive' where id=$1", [d.id]); return "Listing deactivated."; }
    const next = l.approved_at || !review ? "active" : "pending_review";
    await db.run("update listings set status=$2 where id=$1", [d.id, next]);
    return next === "active" ? "Listing is live." : "Sent for review.";
  });
  revalidatePath("/seller/listings");
  return msg;
});

export const deleteListing = action(z.object({ id }), async (d) => {
  const { user } = await activeStore();
  await asUser(user.id, async (db) => {
    const hasOrders = await db.one("select 1 from order_items where listing_id=$1 limit 1", [d.id]);
    if (hasOrders) {
      await db.run("update listings set status='inactive' where id=$1", [d.id]);
      throw new ActionError("This listing has order history, so it was deactivated instead of deleted.");
    }
    await db.run("delete from listings where id=$1", [d.id]);
  });
  redirect("/seller/listings");
});

export const removeImage = action(z.object({ image_id: id }), async (d) => {
  const { user } = await activeStore();
  await asUser(user.id, (db) => db.run("delete from listing_images where id=$1", [d.image_id]));
  return "Photo removed.";
});

export const updateOrder = action(z.object({ order_id: id, status: z.string(), note: optional(300), code: optional(10) }), async (d) => {
  const { user } = await sellerContext();
  await changeOrderStatus(user, d.order_id, d.status, { note: d.note, code: d.code });
  return "Order updated.";
});

export const saveBank = action(z.object({
  bank_name: text(2, 60, "Bank"), account_number: z.string().regex(/^\d{10}$/, "Account numbers have 10 digits"), account_name: text(2, 80, "Account name"),
}), async (d) => {
  const { user } = await sellerContext();
  await asUser(user.id, (db) => db.run("update seller_profiles set bank_name=$2,account_number=$3,account_name=$4 where user_id=$1", [user.id, d.bank_name, d.account_number, d.account_name]));
  return "Payout account saved.";
});

export const requestPayout = action(z.object({ amount: nairaAmount.refine((n) => n >= 100, "The minimum payout is ₦100") }), async (d) => {
  const { user, store } = await activeStore();
  await rateLimit(`payout:${user.id}`, 5, 3600);
  await asSystem(async (db) => {
    await db.one("select id from storefronts where id=$1 for update", [store.id]);
    const b = await db.one("select * from seller_balances where storefront_id=$1", [store.id]);
    const available = Number(b.earned_kobo) - Number(b.paid_out_kobo) - Number(b.requested_kobo);
    if (toKobo(d.amount) > available) throw new ActionError("That's more than your available balance.");
    const sp = await db.one("select bank_name, account_number, account_name from seller_profiles where user_id=$1", [user.id]);
    if (!sp?.account_number) throw new ActionError("Add your payout account first.");
    await db.run("insert into seller_payouts(storefront_id,amount_kobo,bank_snapshot) values ($1,$2,$3)", [store.id, toKobo(d.amount), sp]);
  });
  return "Payout requested.";
});

export const choosePlan = action(z.object({ plan_id: id, provider: z.string().optional() }), async (d) => {
  const { user, plan: current } = await sellerContext();
  const target = await asUser(user.id, (db) => db.one("select * from subscription_plans where id=$1", [d.plan_id]));
  if (!target) throw new ActionError("Plan not found.");
  if (Number(target.price_kobo ?? 1) === 0) {
    await asSystem(async (db) => {
      const n = await db.run("update subscriptions set next_plan_id=$2 where seller_id=$1 and status='active' and expires_at is not null", [user.id, target.id]);
      if (!n) throw new ActionError("You're already on the free plan.");
    });
    return `You'll move to ${target.name} when your current plan ends.`;
  }
  if (target.price_kobo == null) throw new ActionError(`${target.name} isn't on sale yet. The price hasn't been set.`);
  const pay = await beginPayment({
    userId: user.id, email: user.email, purpose: "subscription", provider: d.provider ?? "", amountKobo: Number(target.price_kobo),
    meta: { plan_id: target.id, from_plan: current.code },
  });
  redirect(pay.url);
});

export const cancelDowngrade = action(z.object({}), async () => {
  const { user } = await sellerContext();
  await asSystem((db) => db.run("update subscriptions set next_plan_id=null where seller_id=$1 and status='active'", [user.id]));
  return "Scheduled change cancelled.";
});

export const buyBoost = action(z.object({
  package_id: id, listing_id: id.optional().or(z.literal("").transform(() => undefined)),
  pay_with: z.enum(["credits", "payment"]), provider: z.string().optional(),
}), async (d) => {
  const { user, store } = await activeStore();
  const pkg = await asUser(user.id, (db) => db.one("select * from boost_packages where id=$1 and is_active", [d.package_id]));
  if (!pkg) throw new ActionError("This boost isn't available.");
  if (d.listing_id) {
    const own = await asUser(user.id, (db) => db.one("select 1 from listings where id=$1 and storefront_id=$2 and status='active'", [d.listing_id, store.id]));
    if (!own) throw new ActionError("Pick one of your active listings.");
  } else if (pkg.placement === "homepage_featured") throw new ActionError("Choose the listing to feature.");
  if (d.pay_with === "credits") {
    await asSystem(async (db) => {
      await db.one("select id from users where id=$1 for update", [user.id]);
      const bal = await db.one("select coalesce(sum(delta),0)::int as n from boost_credit_ledger where seller_id=$1", [user.id]);
      if (bal.n < pkg.credit_cost) throw new ActionError("You don't have enough Boost credits.");
      const b = await db.one(
        `insert into store_boosts(storefront_id,listing_id,package_id,placement,status,paid_with,starts_at,ends_at)
         values ($1,$2,$3,$4,'active','credits',now(),now()+make_interval(days=>$5)) returning id`,
        [store.id, d.listing_id ?? null, pkg.id, pkg.placement, pkg.duration_days]);
      await db.run("insert into boost_credit_ledger(seller_id,delta,reason) values ($1,$2,$3)", [user.id, -pkg.credit_cost, `Used on ${pkg.name} (${b.id})`]);
    });
    return "Your boost is live.";
  }
  if (pkg.price_kobo == null || Number(pkg.price_kobo) === 0) throw new ActionError("This boost has no price yet. Use credits or check back later.");
  getProvider(d.provider ?? "");
  const boost = await asSystem((db) => db.one(
    `insert into store_boosts(storefront_id,listing_id,package_id,placement,paid_with) values ($1,$2,$3,$4,'payment') returning id`,
    [store.id, d.listing_id ?? null, pkg.id, pkg.placement]));
  const pay = await beginPayment({
    userId: user.id, email: user.email, purpose: "boost", provider: d.provider ?? "", amountKobo: Number(pkg.price_kobo),
    meta: { boost_id: boost.id }, reference: newReference("BST"),
  });
  redirect(pay.url);
});

export const createCoupon = action(z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Use 3 to 20 letters or digits"),
  percent_off: z.coerce.number().int().min(1).max(90), max_uses: z.string().optional(),
}), async (d) => {
  const { user, store, plan } = await activeStore();
  if (!plan.coupons_enabled) throw new ActionError(`Discount codes aren't part of ${plan.name}. Upgrade to use them.`);
  await asUser(user.id, (db) => db.run(
    "insert into discount_codes(storefront_id,code,percent_off,max_uses) values ($1,$2,$3,$4) on conflict do nothing",
    [store.id, d.code, d.percent_off, d.max_uses ? Number(d.max_uses) : null]));
  return "Discount code created.";
});

export const toggleCoupon = action(z.object({ id }), async (d) => {
  const { user } = await activeStore();
  await asUser(user.id, (db) => db.run("update discount_codes set is_active = not is_active where id=$1", [d.id]));
  return "Discount code updated.";
});

export const createCampaign = action(z.object({
  title: text(3, 80, "Campaign name"), body: optional(160), percent_off: z.coerce.number().int().min(1).max(90), days: z.coerce.number().int().min(1).max(30),
}), async (d) => {
  const { user, store, plan } = await activeStore();
  if (!plan.campaigns_enabled) throw new ActionError(`Marketing campaigns aren't part of ${plan.name}. Upgrade to Odogwu to run them.`);
  await asUser(user.id, (db) => db.run(
    `insert into promotional_campaigns(storefront_id,university_id,title,body,percent_off,href,ends_at) values ($1,$2,$3,$4,$5,$6, now()+make_interval(days=>$7))`,
    [store.id, store.university_id, d.title, d.body, d.percent_off, `/store/${store.slug}`, d.days]));
  return "Campaign is live.";
});

export const endCampaign = action(z.object({ id }), async (d) => {
  const { user } = await activeStore();
  await asUser(user.id, (db) => db.run("update promotional_campaigns set is_active=false where id=$1", [d.id]));
  return "Campaign ended.";
});
