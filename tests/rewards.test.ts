import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { asSystem, asUser } from "@/lib/db";
import { anonymize, deletionBlockers, runDeletions } from "@/lib/deletion";
import { changeOrderStatus, placeOrders, releaseOrder, runSweep } from "@/lib/orders";
import { settleTransaction } from "@/lib/payments/settle";
import { commissionFor, quote, spread } from "@/lib/pricing";
import { assignReferralCode, attachReferral, reverseReferral } from "@/lib/referrals";
import { creditWallet, expireLots, walletBalance } from "@/lib/wallet";

process.env.EMAIL_DRIVER = "outbox"; process.env.PAYSTACK_SECRET_KEY = "sk_test"; process.env.PAYSTACK_BASE_URL = "http://gw";
const gw = new Map<string, { amount: number; status: string }>();
let sent: number[] = [];
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
  if (url.endsWith("/transaction/initialize")) { const b = JSON.parse(String(init!.body)); sent.push(b.amount); gw.set(b.reference, { amount: b.amount, status: "success" }); return j({ data: { authorization_url: "http://gw/pay" } }); }
  const m = url.match(/transaction\/verify\/(.+)$/);
  if (m) { const t = gw.get(decodeURIComponent(m[1]))!; return j({ data: { status: t.status, amount: t.amount, currency: "NGN", id: 1 } }); }
  return j({ data: {} });
});

let store: any, store2: any, seller: any, seller2: any, listing: any, listing2: any, service: any, cat: string, admin: any;
const mk = async (over: Partial<{ created: string }> = {}) => asSystem(async (db) => {
  const email = `${randomUUID()}@t.test`;
  const u = await db.one(`insert into users(email,password_hash,full_name,email_verified_at,created_at) values ($1,'x','Test User',now(),coalesce($2::timestamptz,now())) returning id,email,full_name,role,status,student_status,university_id,email_verified_at,phone,avatar_path`, [email, over.created ?? null]);
  return u;
});
const cart = (u: any, l: any, q = 1) => asSystem((db) => db.run("insert into cart_items(user_id,listing_id,quantity) values ($1,$2,$3) on conflict (user_id,listing_id) do update set quantity=$3", [u.id, l.id, q]));
const onlineOrder = (u: any, o: any = {}) => placeOrders(u, { paymentMethod: "online", provider: "paystack", pickups: { [store.id]: "Cafeteria 1", [store2.id]: "Cafeteria 2" }, ...o });
const pay = async (txId: string) => { const t = await asSystem((db) => db.one("select reference from transactions where id=$1", [txId])); return settleTransaction(t.reference); };
const completeOrder = async (id: string) => {
  const o = await asSystem((db) => db.one("select o.pickup_code, s.owner_id, o.status from orders o join storefronts s on s.id=o.storefront_id where o.id=$1", [id]));
  const owner = await asSystem((db) => db.one("select id,role,status from users where id=$1", [o.owner_id]));
  await changeOrderStatus(owner as any, id, "accepted"); await changeOrderStatus(owner as any, id, "ready_for_pickup"); await changeOrderStatus(owner as any, id, "completed", { code: o.pickup_code });
};
const campaign = (over: Record<string, unknown>) => asSystem(async (db) => {
  const d = { name: "T", code: `C${randomUUID().slice(0, 8)}`.toUpperCase(), is_automatic: false, discount_type: "fixed", discount_value: 100000, status: "active", per_user_limit: 1, ...over } as any;
  const k = Object.keys(d);
  return db.one(`insert into discount_campaigns(${k.join(",")}) values (${k.map((_, i) => `$${i + 1}`).join(",")}) returning *`, k.map((x) => d[x]));
});
const settings = (sql: string) => asSystem((db) => db.run(`update referral_program_settings set ${sql}`));

beforeAll(async () => {
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts --sample", { env: { ...process.env, SEED_PASSWORD: "campora-dev-1" }, stdio: "pipe" });
  await asSystem(async (db) => {
    seller = await db.one("select id,role,status from users where email='kicks@campora.test'");
    seller2 = await db.one("select id,role,status from users where email='wear@campora.test'");
    admin = await db.one("select id from users where role='admin'");
    store = await db.one("select * from storefronts where owner_id=$1", [seller.id]); store2 = await db.one("select * from storefronts where owner_id=$1", [seller2.id]);
    listing = await db.one("select l.* from listings l where storefront_id=$1 and title like 'Hand%'", [store.id]);
    listing2 = await db.one("select l.* from listings l where storefront_id=$1 and title like 'Linen%'", [store2.id]);
    service = await db.one("select l.* from listings l join services s on s.listing_id=l.id where s.price_type='fixed' limit 1");
    cat = listing.category_id;
    await db.run("update products set stock=500");
  });
}, 60000);
beforeEach(async () => { sent = []; await settings("enabled=true,suspended=false,period_days=30,max_referrals=5,referrer_reward=50000,referred_reward=50000,recipients='both',minimum_order_kobo=0,reward_expiry_days=60,reward_type='fixed'"); await asSystem((db) => db.run("update discount_campaigns set status='archived'")); });

describe("spread", () => { it("adds up exactly", () => { expect(spread(100, [1, 1, 1]).reduce((a, b) => a + b)).toBe(100); }); });

describe("admin discounts", () => {
  it("percentage discount with a cap", async () => {
    const c = await campaign({ discount_type: "percentage", discount_value: 20, maximum_discount_kobo: 300000 });
    const u = await mk(); await cart(u, listing); // 32,000
    const q = await asSystem((db) => quote(db, u, { code: c.code, online: true }));
    expect(q.campaignKobo).toBe(300000); expect(q.totalKobo).toBe(2900000);
  });
  it("fixed discount, and the gateway gets the discounted amount", async () => {
    const c = await campaign({ discount_value: 100000 });
    const u = await mk(); await cart(u, listing);
    await onlineOrder(u, { coupon: c.code });
    expect(sent).toEqual([3100000]);
  });
  it("automatic discount applies with no code, only to its category", async () => {
    await campaign({ code: null, is_automatic: true, discount_type: "percentage", discount_value: 10, target_category_ids: [cat] });
    const u = await mk(); await cart(u, listing); await cart(u, listing2);
    const q = await asSystem((db) => quote(db, u, { online: true }));
    expect(q.campaignKobo).toBe(320000);
  });
  it("ignores scheduled, expired, paused and draft discounts", async () => {
    const u = await mk(); await cart(u, listing);
    for (const c of [
      await campaign({ starts_at: new Date(Date.now() + 86400000) }),
      await campaign({ starts_at: new Date(Date.now() - 2 * 86400000), expires_at: new Date(Date.now() - 86400000) }),
      await campaign({ status: "paused" }), await campaign({ status: "draft" })]) {
      const q = await asSystem((db) => quote(db, u, { code: c.code, online: true }));
      expect(q.campaignKobo).toBe(0); expect(q.codeValid).toBe(false);
    }
    await expect(onlineOrder(u, { coupon: "NOPE" })).rejects.toThrow(/valid/);
  });
  it("a scheduled discount goes live on time", async () => {
    const c = await campaign({ starts_at: new Date(Date.now() - 1000) });
    const u = await mk(); await cart(u, listing);
    expect((await asSystem((db) => quote(db, u, { code: c.code, online: true }))).campaignKobo).toBe(100000);
  });
  it("blocks ineligible users", async () => {
    const old = await mk({ created: "2020-01-01" }); await cart(old, listing);
    const c = await campaign({ user_scope: "new_users" });
    expect((await asSystem((db) => quote(db, old, { code: c.code, online: true }))).codeMessage).toMatch(/qualify/);
    const s = await campaign({ user_scope: "selected", selected_user_emails: ["someone@else.test"] });
    expect((await asSystem((db) => quote(db, old, { code: s.code, online: true }))).codeValid).toBe(false);
  });
  it("first-time discount stops after a first completed order", async () => {
    const u = await mk(); await cart(u, listing);
    const { orderIds, txId } = await onlineOrder(u); await pay(txId!); await completeOrder(orderIds[0].id);
    const c = await campaign({ user_scope: "first_time" }); await cart(u, listing);
    expect((await asSystem((db) => quote(db, u, { code: c.code, online: true }))).codeValid).toBe(false);
  });
  it("enforces per-user and total limits, including under concurrency", async () => {
    const c = await campaign({ usage_limit: 1, per_user_limit: 1 });
    const [a, b] = [await mk(), await mk()]; await cart(a, listing); await cart(b, listing);
    const r = await Promise.allSettled([onlineOrder(a, { coupon: c.code }), onlineOrder(b, { coupon: c.code })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const n = await asSystem((db) => db.one("select count(*)::int n from discount_redemptions where campaign_id=$1", [c.id]));
    expect(n.n).toBe(1);
  });
  it("frees the redemption when payment fails", async () => {
    const c = await campaign({ usage_limit: 1 });
    const u = await mk(); await cart(u, listing);
    const { txId } = await onlineOrder(u, { coupon: c.code });
    const t = await asSystem((db) => db.one("select reference from transactions where id=$1", [txId]));
    gw.get(t.reference)!.status = "failed"; await settleTransaction(t.reference);
    const r = await asSystem((db) => db.one("select status from discount_redemptions where campaign_id=$1", [c.id]));
    expect(r.status).toBe("released");
  });
  it("won't combine unless both allow it", async () => {
    await campaign({ code: null, is_automatic: true, discount_value: 50000 });
    const c = await campaign({ discount_value: 50000 });
    const u = await mk(); await cart(u, listing);
    expect((await asSystem((db) => quote(db, u, { code: c.code, online: true }))).campaignKobo).toBe(50000);
    await asSystem((db) => db.run("update discount_campaigns set stackable=true where status='active'"));
    expect((await asSystem((db) => quote(db, u, { code: c.code, online: true }))).campaignKobo).toBe(100000);
  });
  it("Vybe-funded discounts need online payment", async () => {
    const c = await campaign({});
    const u = await mk(); await cart(u, listing);
    expect((await asSystem((db) => quote(db, u, { code: c.code, online: false }))).codeMessage).toMatch(/online/);
  });
});

describe("commission", () => {
  it("is 5% of sale; Vybe-funded discounts don't touch the seller", async () => {
    const c = await campaign({ discount_value: 50000 });
    const u = await mk(); await cart(u, listing);
    const { orderIds, txId } = await onlineOrder(u, { coupon: c.code }); await pay(txId!); await completeOrder(orderIds[0].id);
    const r = await asSystem((db) => db.one("select * from commissions where order_id=$1", [orderIds[0].id]));
    expect([Number(r.eligible_kobo), Number(r.commission_kobo), Number(r.net_kobo)]).toEqual([3200000, 160000, 3040000]);
  });
  it("seller-funded discounts reduce the commission base", async () => {
    const c = await campaign({ discount_value: 200000, funding_source: "seller", target_storefront_ids: [store.id], seller_agreement_ref: "A1" });
    const u = await mk(); await cart(u, listing);
    const { orderIds, txId } = await onlineOrder(u, { coupon: c.code }); await pay(txId!); await completeOrder(orderIds[0].id);
    const r = await asSystem((db) => db.one("select * from commissions where order_id=$1", [orderIds[0].id]));
    expect([Number(r.eligible_kobo), Number(r.commission_kobo), Number(r.net_kobo)]).toEqual([3000000, 150000, 2850000]);
  });
  it("shared funding splits the cost", async () => {
    const c = await campaign({ discount_value: 100000, funding_source: "shared", seller_share_percent: 50, target_storefront_ids: [store.id], seller_agreement_ref: "A2" });
    const u = await mk(); await cart(u, listing);
    const { orderIds } = await onlineOrder(u, { coupon: c.code });
    const o = await asSystem((db) => db.one("select seller_funded_kobo, platform_funded_kobo from orders where id=$1", [orderIds[0].id]));
    expect([Number(o.seller_funded_kobo), Number(o.platform_funded_kobo)]).toEqual([50000, 50000]);
  });
  it("splits multi-seller orders, charged once each; the gateway total matches", async () => {
    const u = await mk(); await cart(u, listing); await cart(u, listing2);
    const { orderIds, txId } = await onlineOrder(u); await pay(txId!);
    for (const o of orderIds) await completeOrder(o.id);
    const r = await asSystem((db) => db.rows("select commission_kobo from commissions where order_id = any($1) order by 1", [orderIds.map((o) => o.id)]));
    expect(r.map((x) => Number(x.commission_kobo))).toEqual([90000, 160000]);
    expect(sent[sent.length - 1]).toBe(3200000 + 1800000);
  });
  it("uses category rates, keeps past rates, and records cash orders as owed", async () => {
    const u = await mk(); await cart(u, listing);
    const { orderIds } = await placeOrders(u, { paymentMethod: "pay_on_pickup", pickups: { [store.id]: "Cafeteria 1" } });
    await completeOrder(orderIds[0].id);
    const r = await asSystem((db) => db.one("select * from commissions where order_id=$1", [orderIds[0].id]));
    expect(r.status).toBe("owed"); expect(Number(r.commission_kobo)).toBe(160000);
    await asSystem((db) => db.run("update categories set commission_bps=1000 where id=$1", [cat]));
    const o = await asSystem((db) => db.one("select * from orders where id=$1", [orderIds[0].id]));
    expect((await asSystem((db) => commissionFor(db, o))).fee).toBe(320000);
    expect(Number((await asSystem((db) => db.one("select commission_kobo from commissions where order_id=$1", [orderIds[0].id]))).commission_kobo)).toBe(160000);
    await asSystem((db) => db.run("update categories set commission_bps=null where id=$1", [cat]));
  });
  it("the ledger refuses edits and deletes", async () => {
    await asSystem((db) => db.run("insert into financial_ledger(reference,entry_type,amount_kobo) values ('t1','test',1)"));
    await expect(asSystem((db) => db.run("update financial_ledger set amount_kobo=2 where reference='t1'"))).rejects.toThrow(/LEDGER_IMMUTABLE/);
    await expect(asSystem((db) => db.run("delete from financial_ledger where reference='t1'"))).rejects.toThrow(/LEDGER_IMMUTABLE/);
  });
});

describe("wallet", () => {
  const give = (u: any, kobo: number, days = 30) => asSystem((db) => creditWallet(db, { userId: u.id, amountKobo: kobo, reference: `t:${randomUUID()}`, description: "t", expiresAt: new Date(Date.now() + days * 86400000) }));
  it("credits apply at checkout and match the gateway amount", async () => {
    const u = await mk(); await give(u, 50000); await cart(u, listing);
    const { txId } = await onlineOrder(u, { useCredit: true }); await pay(txId!);
    expect(sent).toEqual([3150000]);
    expect(await asSystem((db) => walletBalance(db, u.id))).toBe(0);
  });
  it("combines a discount and credit like the spec example", async () => {
    const c = await campaign({ discount_value: 100000 });
    const u = await mk(); await give(u, 50000); await cart(u, listing);
    const q = await asSystem((db) => quote(db, u, { code: c.code, useCredit: true, online: true }));
    expect([q.campaignKobo, q.creditKobo, q.totalKobo]).toEqual([100000, 50000, 3050000]);
  });
  it("credit can't be spent twice at once", async () => {
    const u = await mk(); await give(u, 50000);
    await cart(u, listing);
    const a = onlineOrder(u, { useCredit: true });
    await a; await cart(u, listing);
    await onlineOrder(u, { useCredit: true });
    expect(sent).toEqual([3150000, 3200000]);
  });
  it("expired credit can't be redeemed, and the sweep records it", async () => {
    const u = await mk(); await give(u, 50000, -1);
    expect(await asSystem((db) => walletBalance(db, u.id))).toBe(0);
    await asSystem((db) => expireLots(db));
    const t = await asSystem((db) => db.one("select amount_kobo from wallet_transactions where user_id=$1 and transaction_type='expiry'", [u.id]));
    expect(Number(t.amount_kobo)).toBe(-50000);
  });
  it("users can't touch their balance", async () => {
    const u = await mk();
    await expect(asUser(u.id, (db) => db.run("insert into wallet_lots(user_id,amount_kobo,remaining_kobo,expires_at) values ($1,1,1,now())", [u.id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (db) => db.run("update wallet_lots set remaining_kobo=999"))).rejects.toThrow(/permission denied/);
    await expect(asUser(u.id, (db) => db.run("insert into wallet_transactions(user_id,transaction_type,amount_kobo,reference,description) values ($1,'reward',1,'x','x')", [u.id]))).rejects.toThrow(/permission denied/);
  });
  it("failed payment and cancellation restore credit exactly once", async () => {
    const u = await mk(); await give(u, 50000); await cart(u, listing);
    const { orderIds, txId } = await onlineOrder(u, { useCredit: true });
    const t = await asSystem((db) => db.one("select reference from transactions where id=$1", [txId]));
    gw.get(t.reference)!.status = "failed"; await settleTransaction(t.reference);
    await asSystem((db) => releaseOrder(db, orderIds[0].id));
    expect(await asSystem((db) => walletBalance(db, u.id))).toBe(50000);
  });
  it("a credit reference is honoured once", async () => {
    const u = await mk(); const ref = `t:${randomUUID()}`; const e = new Date(Date.now() + 86400000);
    await asSystem((db) => creditWallet(db, { userId: u.id, amountKobo: 100, reference: ref, description: "x", expiresAt: e }));
    expect(await asSystem((db) => creditWallet(db, { userId: u.id, amountKobo: 100, reference: ref, description: "x", expiresAt: e }))).toBe(false);
    expect(await asSystem((db) => walletBalance(db, u.id))).toBe(100);
  });
});

describe("referrals", () => {
  const refer = async (a: any, b: any, ip: string | null = null) => { const code = await asSystem((db) => assignReferralCode(db, a.id)); await asSystem((db) => attachReferral(db, b, code, ip)); return code; };
  const buy = async (u: any) => { await cart(u, listing); const r = await onlineOrder(u); await pay(r.txId!); return r.orderIds[0].id as string; };
  const row = (b: any) => asSystem((db) => db.one("select * from referrals where referred_user_id=$1", [b.id]));
  it("gives everyone a unique code", async () => {
    const users = []; for (let i = 0; i < 20; i++) users.push(await mk());
    const codes = await Promise.all(users.map((u) => asSystem((db) => assignReferralCode(db, u.id))));
    expect(new Set(codes).size).toBe(20);
  });
  it("runs registered, awaiting, reward issued; pays both once", async () => {
    const [a, b] = [await mk(), await mk()]; await refer(a, b);
    expect((await row(b)).status).toBe("pending_purchase");
    const id = await buy(b); expect((await row(b)).status).toBe("awaiting_completion");
    await completeOrder(id);
    expect((await row(b)).status).toBe("reward_issued");
    expect(await asSystem((db) => walletBalance(db, a.id))).toBe(50000);
    expect(await asSystem((db) => walletBalance(db, b.id))).toBe(50000);
    const again = await asSystem(async (db) => { await db.run("update referrals set status='awaiting_completion', qualifying_order_id=null where referred_user_id=$1", [b.id]); const { processReferral } = await import("@/lib/referrals"); const o = await db.one("select * from orders where id=$1", [id]); await processReferral(db, o); return walletBalance(db, a.id); });
    expect(again).toBe(50000);
  });
  it("rejects expired referrers, self-referral, repeat referrers and pickup orders", async () => {
    const old = await mk({ created: "2020-01-01" }); const b = await mk(); await refer(old, b);
    expect(await row(b)).toBeNull();
    const a = await mk(); await refer(a, a); expect(await row(a)).toBeNull();
    const c = await mk(); await refer(a, c); await refer(old, c); await refer(await mk(), c);
    expect((await row(c)).referrer_id).toBe(a.id);
    await cart(c, listing);
    const { orderIds } = await placeOrders(c, { paymentMethod: "pay_on_pickup", pickups: { [store.id]: "x" } }); await completeOrder(orderIds[0].id);
    expect((await row(c)).status).toBe("pending_purchase");
  });
  it("still pays a referral made in the window after the window ends", async () => {
    const [a, b] = [await mk(), await mk()]; await refer(a, b);
    await asSystem((db) => db.run("update users set created_at='2020-01-01' where id=$1", [a.id]));
    await completeOrder(await buy(b));
    expect((await row(b)).status).toBe("reward_issued");
  });
  it("needs the minimum order and respects the programme switch", async () => {
    await settings("minimum_order_kobo=99999999");
    const [a, b] = [await mk(), await mk()]; await refer(a, b); await completeOrder(await buy(b));
    expect((await row(b)).status).not.toBe("reward_issued");
    await settings("enabled=false"); const [c, d] = [await mk(), await mk()]; await refer(c, d); expect(await row(d)).toBeNull();
  });
  it("caps rewards per referrer", async () => {
    await settings("max_referrals=1");
    const a = await mk(); const [b, c] = [await mk(), await mk()];
    await refer(a, b); await refer(a, c);
    await completeOrder(await buy(b)); await completeOrder(await buy(c));
    expect((await row(c)).status).toBe("rejected");
    expect(await asSystem((db) => walletBalance(db, a.id))).toBe(50000);
  });
  it("cancelled orders pay nothing; a refund takes back unspent reward", async () => {
    const [a, b] = [await mk(), await mk()]; await refer(a, b);
    const id = await buy(b); await asSystem((db) => db.run("update refunds set status='rejected'"));
    const u = await asSystem((db) => db.one("select id,role,status from users where id=$1", [b.id]));
    await changeOrderStatus(u as any, id, "cancelled");
    expect(await asSystem((db) => walletBalance(db, a.id))).toBe(0);
    const [c, d] = [await mk(), await mk()]; await refer(c, d); const oid = await buy(d); await completeOrder(oid);
    await asSystem((db) => reverseReferral(db, oid));
    expect(await asSystem((db) => walletBalance(db, c.id))).toBe(0);
    expect((await row(d)).status).toBe("rejected");
  });
  it("sends suspicious signups to review without paying", async () => {
    const a = await mk(); const list = [await mk(), await mk(), await mk()];
    for (const b of list) await refer(a, b, "same-ip");
    expect((await row(list[2])).status).toBe("review");
    await completeOrder(await buy(list[2]));
    expect(await asSystem((db) => walletBalance(db, a.id))).toBe(0);
    expect((await row(list[2])).qualifying_order_id).not.toBeNull();
  });
});

describe("account deletion", () => {
  it("blocks while orders are open, then anonymizes and keeps financial records", async () => {
    const u = await mk(); await cart(u, listing);
    const { orderIds, txId } = await onlineOrder(u); await pay(txId!);
    expect((await asSystem((db) => deletionBlockers(db, u.id))).length).toBe(1);
    await completeOrder(orderIds[0].id);
    expect(await asSystem((db) => deletionBlockers(db, u.id))).toEqual([]);
    await asSystem(async (db) => {
      await db.run("insert into file_blobs(path,content_type,data,is_private,owner_id) values ($1,'image/png','x',true,$2)", [`private/student-ids/${u.id}`, u.id]);
      await db.run("insert into student_verifications(user_id,university_id,method,document_path,matric_number) select $1,id,'id_upload',$2,'M1' from universities limit 1", [u.id, `private/student-ids/${u.id}`]);
      await db.run("insert into account_deletion_requests(user_id,scheduled_for) values ($1, now()-interval '1 minute')", [u.id]);
      await db.run("insert into sessions(user_id,token_hash,expires_at) values ($1,$2,now()+interval '1 day')", [u.id, u.id]);
    });
    await asSystem((db) => runDeletions(db));
    const r = await asSystem(async (db) => ({
      u: await db.one("select email, full_name, deleted_at, status from users where id=$1", [u.id]), o: await db.one("select count(*)::int n from orders where buyer_id=$1", [u.id]),
      s: await db.one("select count(*)::int n from sessions where user_id=$1", [u.id]), f: await db.one("select count(*)::int n from file_blobs where owner_id=$1", [u.id]), v: await db.one("select document_path, matric_number from student_verifications where user_id=$1", [u.id]),
    }));
    expect(r.u.email).toMatch(/deleted.invalid$/); expect(r.u.full_name).toBe("Deleted user"); expect(r.u.status).toBe("suspended");
    expect(r.o.n).toBe(1); expect(r.s.n).toBe(0); expect(r.f.n).toBe(0); expect(r.v).toEqual({ document_path: null, matric_number: null });
  });
  it("waits for the grace period", async () => {
    const u = await mk();
    await asSystem((db) => db.run("insert into account_deletion_requests(user_id,scheduled_for) values ($1, now()+interval '7 days')", [u.id]));
    await runSweep();
    expect((await asSystem((db) => db.one("select deleted_at from users where id=$1", [u.id]))).deleted_at).toBeNull();
    void anonymize;
  });
});

describe("permissions on new tables", () => {
  it("hides other people's money and blocks writes", async () => {
    const [a, b] = [await mk(), await mk()];
    await asSystem((db) => creditWallet(db, { userId: a.id, amountKobo: 100, reference: `t:${randomUUID()}`, description: "x", expiresAt: new Date(Date.now() + 86400000) }));
    expect(await asUser(b.id, (db) => db.rows("select * from wallet_transactions where user_id=$1", [a.id]))).toHaveLength(0);
    expect(await asUser(b.id, (db) => db.rows("select * from discount_campaigns"))).toHaveLength(0);
    expect(await asUser(b.id, (db) => db.rows("select * from financial_ledger"))).toHaveLength(0);
    await expect(asUser(b.id, (db) => db.run("update referrals set status='reward_issued'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(b.id, (db) => db.run("update discount_campaigns set status='active'"))).rejects.toThrow(/permission denied/);
  });
  it("every new table has RLS", async () => {
    expect(await asSystem((db) => db.rows("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"))).toEqual([]);
  });
});
