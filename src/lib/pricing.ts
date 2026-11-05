import type { Db } from "./db";
import { walletBalance } from "./wallet";

/** The single place prices are worked out. Checkout preview and order creation both call it. */
export const MIN_ONLINE_KOBO = 10000; // Keeps a small card payment after credits are applied.

export type Line = { id: string; title: string; kind: string; category_id: string; storefront_id: string; store_name: string; quantity: number; unit: number; base_unit: number; stock: number | null; price_type: string | null; in_stock: boolean; owner_id: string };
export type StoreQuote = {
  storefront_id: string; store_name: string; lines: Line[]; originalKobo: number; subtotalKobo: number; couponKobo: number; couponId: string | null;
  campaignKobo: number; campaignSellerKobo: number; campaignPlatformKobo: number; creditKobo: number; totalKobo: number; allocations: { campaignId: string; kobo: number; seller: number; platform: number }[];
};
export type Quote = {
  stores: StoreQuote[]; originalKobo: number; subtotalKobo: number; saleSavingsKobo: number; couponKobo: number; campaignKobo: number; creditKobo: number; totalKobo: number; savingsKobo: number;
  campaigns: { id: string; name: string; code: string | null; kobo: number }[]; codeMessage: string | null; codeValid: boolean; creditAvailable: number; creditUsable: boolean;
};

export async function cartLines(db: Db, userId: string): Promise<Line[]> {
  const rows = await db.rows(
    `select c.quantity, l.id, l.title, l.kind, l.category_id, l.storefront_id, l.store_name, l.effective_price_kobo, l.price_kobo, l.stock, l.price_type, l.in_stock, s.owner_id
     from cart_items c join listing_cards l on l.id=c.listing_id join storefronts s on s.id=l.storefront_id
     where c.user_id=$1 and l.status='active' and s.status='active' order by l.store_name`, [userId]);
  return rows.map((r) => ({ ...r, unit: Number(r.effective_price_kobo), base_unit: Number(r.price_kobo) }));
}

const LIVE = "status='active' and starts_at<=now() and (expires_at is null or expires_at>now())";

function targets(c: any, l: Line) {
  const hasTargets = c.target_listing_ids.length || c.target_category_ids.length || c.target_storefront_ids.length;
  return !hasTargets || c.target_listing_ids.includes(l.id) || c.target_category_ids.includes(l.category_id) || c.target_storefront_ids.includes(l.storefront_id);
}

async function userEligible(db: Db, c: any, user: { id: string; email: string }) {
  if (c.user_scope === "selected") return c.selected_user_emails.map((e: string) => e.toLowerCase()).includes(user.email.toLowerCase());
  if (c.user_scope === "new_users") {
    const r = await db.one("select created_at > now() - make_interval(days => $2) ok from users where id=$1", [user.id, c.new_user_days]);
    return !!r?.ok;
  }
  if (c.user_scope === "first_time") {
    const r = await db.one("select count(*)::int n from orders where buyer_id=$1 and status='completed'", [user.id]);
    return r.n === 0;
  }
  return true;
}

async function withinLimits(db: Db, c: any, userId: string) {
  const r = await db.one(
    `select count(distinct order_id)::int total, count(distinct order_id) filter (where user_id=$2)::int mine from discount_redemptions where campaign_id=$1 and status<>'released'`, [c.id, userId]);
  return (c.usage_limit == null || r.total < c.usage_limit) && r.mine < c.per_user_limit;
}

/** Spreads an amount across weights so the parts always add up exactly. */
export function spread(amount: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((amount * w) / sum));
  let left = amount - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts.length) if (weights[i] > 0) { parts[i]++; left--; }
  return parts;
}

export async function quote(db: Db, user: { id: string; email: string }, input: { code?: string | null; useCredit?: boolean; online: boolean }): Promise<Quote> {
  const lines = await cartLines(db, user.id);
  const stores = new Map<string, StoreQuote>();
  for (const l of lines) {
    const s = stores.get(l.storefront_id) ?? { storefront_id: l.storefront_id, store_name: l.store_name, lines: [], originalKobo: 0, subtotalKobo: 0, couponKobo: 0, couponId: null, campaignKobo: 0, campaignSellerKobo: 0, campaignPlatformKobo: 0, creditKobo: 0, totalKobo: 0, allocations: [] };
    s.lines.push(l); s.originalKobo += l.base_unit * l.quantity; s.subtotalKobo += l.unit * l.quantity; stores.set(l.storefront_id, s);
  }
  const list = [...stores.values()];
  const code = input.code?.trim().toUpperCase() || null;
  let codeMessage: string | null = null; let codeValid = false;

  if (code) for (const s of list) {
    const c = await db.one(
      `select dc.* from discount_codes dc join storefronts st on st.id=dc.storefront_id
       where dc.storefront_id=$1 and dc.code=$2 and dc.is_active and (dc.expires_at is null or dc.expires_at>now())
         and (dc.max_uses is null or dc.used_count<dc.max_uses) and (effective_plan(st.owner_id)).coupons_enabled`, [s.storefront_id, code]);
    if (c) { s.couponKobo = Math.floor((s.subtotalKobo * c.percent_off) / 100); s.couponId = c.id; codeValid = true; }
  }

  const candidates: any[] = [];
  const coded = code ? await db.one(`select * from discount_campaigns where upper(code)=$1 and ${LIVE}`, [code]) : null;
  if (coded) candidates.push(coded);
  candidates.push(...await db.rows(`select * from discount_campaigns where is_automatic and ${LIVE} order by created_at`));

  const applied: { c: any; kobo: number }[] = [];
  for (const c of candidates) {
    const isCode = c.id === coded?.id;
    const fail = (m: string) => { if (isCode) codeMessage = m; };
    const platformFunded = c.funding_source !== "seller";
    if (platformFunded && !input.online) { fail("This discount works with online payment only."); continue; }
    if (!(await userEligible(db, c, user))) { fail("Your account doesn't qualify for this discount."); continue; }
    if (!(await withinLimits(db, c, user.id))) { fail("This discount has reached its limit."); continue; }
    if (applied.length && !(c.stackable && applied.every((a) => a.c.stackable))) { fail("This discount can't be combined with your other discount."); continue; }
    if (list.some((s) => s.couponKobo > 0) && !c.stackable) { fail("This discount can't be combined with a seller code."); continue; }
    const weights = list.map((s) => {
      const after = s.subtotalKobo - s.couponKobo - s.campaignKobo;
      const raw = s.lines.filter((l) => targets(c, l)).reduce((a, l) => a + l.unit * l.quantity, 0);
      return Math.max(0, Math.min(raw, after));
    });
    const eligible = weights.reduce((a, b) => a + b, 0);
    if (!eligible || eligible < Number(c.minimum_order_kobo)) { fail(eligible ? "Your cart is below this discount's minimum." : "This discount doesn't apply to your cart."); continue; }
    let kobo = c.discount_type === "percentage" ? Math.floor((eligible * Number(c.discount_value)) / 100) : Math.min(Number(c.discount_value), eligible);
    if (c.maximum_discount_kobo) kobo = Math.min(kobo, Number(c.maximum_discount_kobo));
    if (input.online) kobo = Math.min(kobo, Math.max(0, list.reduce((a, s) => a + s.subtotalKobo - s.couponKobo - s.campaignKobo, 0) - MIN_ONLINE_KOBO));
    if (kobo <= 0) continue;
    const share = c.funding_source === "platform" ? 0 : c.funding_source === "seller" ? 100 : c.seller_share_percent;
    spread(kobo, weights).forEach((part, i) => {
      if (!part) return;
      const seller = Math.round((part * share) / 100);
      const s = list[i];
      s.campaignKobo += part; s.campaignSellerKobo += seller; s.campaignPlatformKobo += part - seller;
      s.allocations.push({ campaignId: c.id, kobo: part, seller, platform: part - seller });
    });
    applied.push({ c, kobo });
    if (isCode) codeValid = true;
  }
  if (code && !codeValid && !codeMessage) codeMessage = "That code isn't valid.";

  const creditAvailable = await walletBalance(db, user.id);
  const creditUsable = input.online && creditAvailable > 0;
  if (input.useCredit && creditUsable) {
    const payable = list.map((s) => s.subtotalKobo - s.couponKobo - s.campaignKobo);
    const use = Math.min(creditAvailable, Math.max(0, payable.reduce((a, b) => a + b, 0) - MIN_ONLINE_KOBO));
    spread(use, payable).forEach((part, i) => { list[i].creditKobo = part; });
  }
  for (const s of list) s.totalKobo = s.subtotalKobo - s.couponKobo - s.campaignKobo - s.creditKobo;
  const sum = (f: (s: StoreQuote) => number) => list.reduce((a, s) => a + f(s), 0);
  const q = { originalKobo: sum((s) => s.originalKobo), subtotalKobo: sum((s) => s.subtotalKobo), couponKobo: sum((s) => s.couponKobo), campaignKobo: sum((s) => s.campaignKobo), creditKobo: sum((s) => s.creditKobo), totalKobo: sum((s) => s.totalKobo) };
  return {
    stores: list, ...q, saleSavingsKobo: q.originalKobo - q.subtotalKobo, savingsKobo: q.originalKobo - q.totalKobo,
    campaigns: applied.map((a) => ({ id: a.c.id, name: a.c.name, code: a.c.code, kobo: a.kobo })), codeMessage, codeValid, creditAvailable, creditUsable,
  };
}

/** Commission on what the seller actually sold for: after discounts they fund, before Campora-funded ones. */
export async function commissionFor(db: Db, order: any) {
  const items = await db.rows("select i.id, i.unit_price_kobo, i.quantity, c.commission_bps from order_items i left join categories c on c.id=i.category_id where i.order_id=$1", [order.id]);
  const def = Number((await db.one("select value from platform_settings where key='commission_bps'"))?.value ?? 500);
  const gross = items.map((i) => Number(i.unit_price_kobo) * i.quantity);
  const reductions = spread(Number(order.seller_funded_kobo), gross);
  let fee = 0; let eligible = 0;
  const rows = items.map((it, i) => {
    const base = gross[i] - reductions[i];
    const bps = it.commission_bps ?? def;
    const kobo = Math.round((base * bps) / 10000);
    fee += kobo; eligible += base;
    return { id: it.id, bps, kobo };
  });
  return { gross: gross.reduce((a, b) => a + b, 0), eligible, fee, net: eligible - fee, rows, rateBps: eligible ? Math.round((fee * 10000) / eligible) : def };
}
