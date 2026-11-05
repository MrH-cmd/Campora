import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { asSystem, asUser } from "@/lib/db";
import { changeOrderStatus, placeOrders, runSweep } from "@/lib/orders";
import { providers } from "@/lib/payments/providers";

const url = process.env.DATABASE_URL!;
let buyer: any, buyer2: any, seller: any, seller2: any, admin: any, store: any, store2: any, listing: any, service: any;

const user = (email: string) => asSystem((db) => db.one(
  "select id,email,full_name,role,status,student_status,university_id,email_verified_at,phone,avatar_path from users where email=$1", [email]));

beforeAll(() => {
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts --sample", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
});
beforeAll(async () => {
  buyer = await user("buyer@campora.test"); admin = await user("admin@campora.test");
  seller = await user("kicks@campora.test"); seller2 = await user("bowl@campora.test");
  buyer2 = await user("wear@campora.test");
  store = await asSystem((db) => db.one("select * from storefronts where owner_id=$1", [seller.id]));
  store2 = await asSystem((db) => db.one("select * from storefronts where owner_id=$1", [seller2.id]));
  listing = await asSystem((db) => db.one("select l.*, p.stock from listings l join products p on p.listing_id=l.id where storefront_id=$1 limit 1", [store.id]));
  service = await asSystem((db) => db.one("select * from listings where storefront_id=$1 and kind='service'", [store.id]));
}, 60000);

const cart = (uid: string, lid: string, q = 1) => asSystem((db) => db.run("insert into cart_items(user_id,listing_id,quantity) values ($1,$2,$3) on conflict (user_id,listing_id) do update set quantity=$3", [uid, lid, q]));
const pickup = { paymentMethod: "pay_on_pickup" as const, pickupPoint: "Cafeteria 1", pickups: {} };

describe("row level security", () => {
  it("is enabled on every table", async () => {
    const r = await asSystem((db) => db.rows("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"));
    expect(r).toEqual([]);
  });
  it("hides password hashes, sessions and tokens from the app role", async () => {
    await expect(asUser(buyer.id, (db) => db.rows("select password_hash from users"))).rejects.toThrow(/permission denied/);
    await expect(asUser(buyer.id, (db) => db.rows("select * from sessions"))).rejects.toThrow(/permission denied/);
    await expect(asUser(buyer.id, (db) => db.rows("select * from auth_tokens"))).rejects.toThrow(/permission denied/);
  });
  it("stops users promoting themselves", async () => {
    await expect(asUser(buyer.id, (db) => db.run("update users set role='admin' where id=$1", [buyer.id]))).rejects.toThrow(/permission denied/);
    await expect(asUser(buyer.id, (db) => db.run("update users set student_status='verified' where id=$1", [buyer.id]))).rejects.toThrow(/permission denied/);
  });
  it("stops one seller editing another seller's listing", async () => {
    const n = await asUser(seller2.id, (db) => db.run("update listings set price_kobo=1 where id=$1", [listing.id]));
    expect(n).toBe(0);
    await expect(asUser(seller2.id, (db) => db.run(
      "insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo) values ($1,$2,'product','x','Stolen','desc',1)", [store.id, listing.category_id]))).rejects.toThrow(/row-level security/);
  });
  it("stops sellers approving their own listings", async () => {
    await expect(asUser(seller.id, (db) => db.run("update listings set approved_at=now() where id=$1", [listing.id]))).rejects.toThrow(/permission denied/);
  });
  it("hides other people's orders, messages, bank details and cart", async () => {
    await cart(buyer.id, listing.id);
    const { orderIds } = await placeOrders(buyer, pickup);
    const see = (uid: string) => asUser(uid, (db) => db.rows("select id from orders where id=$1", [orderIds[0].id]));
    expect(await see(buyer.id)).toHaveLength(1);
    expect(await see(seller.id)).toHaveLength(1);
    expect(await see(seller2.id)).toHaveLength(0);
    expect(await see(buyer2.id)).toHaveLength(0);
    expect(await asUser(null, (db) => db.rows("select id from orders"))).toHaveLength(0);
    expect(await asUser(seller2.id, (db) => db.rows("select * from seller_profiles where user_id=$1", [seller.id]))).toHaveLength(0);
    await cart(buyer.id, listing.id);
    expect(await asUser(buyer2.id, (db) => db.rows("select * from cart_items where user_id=$1", [buyer.id]))).toHaveLength(0);
    await asSystem((db) => db.run("delete from cart_items"));
    await asSystem(async (db) => {
      const c = await db.one("insert into conversations(buyer_id,storefront_id) values ($1,$2) returning id", [buyer.id, store.id]);
      await db.run("insert into messages(conversation_id,sender_id,body) values ($1,$2,'private')", [c.id, buyer.id]);
    });
    expect(await asUser(seller2.id, (db) => db.rows("select * from messages"))).toHaveLength(0);
    expect(await asUser(seller.id, (db) => db.rows("select * from messages"))).toHaveLength(1);
  });
  it("lets only admins read the audit log and other users", async () => {
    await asSystem((db) => db.run("insert into admin_activity_logs(admin_id,action) values ($1,'test')", [admin.id]));
    expect(await asUser(buyer.id, (db) => db.rows("select * from admin_activity_logs"))).toHaveLength(0);
    expect((await asUser(admin.id, (db) => db.rows("select * from admin_activity_logs"))).length).toBe(1);
  });
  it("cannot write financial records from the app role", async () => {
    await expect(asUser(seller.id, (db) => db.run("insert into commissions(order_id,storefront_id,rate_bps,gross_kobo,commission_kobo,net_kobo) select id,storefront_id,0,1,0,1 from orders limit 1"))).rejects.toThrow(/permission denied/);
    await expect(asUser(seller.id, (db) => db.run("update orders set payment_status='paid'"))).rejects.toThrow(/permission denied/);
  });
});

describe("plan limits, enforced by the database", () => {
  it("blocks a sixth active listing on K-Leg", async () => {
    const add = (i: number) => asUser(seller.id, (db) => db.run(
      "insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,status) values ($1,$2,'product',$3,$3,'desc here',100,'pending_review')", [store.id, listing.category_id, `limit-test-${i}`]));
    await add(1); await add(2);
    await expect(add(3)).rejects.toThrow(/LISTING_LIMIT/);
  });
  it("blocks a fifth photo on K-Leg", async () => {
    const add = (i: number) => asUser(seller.id, (db) => db.run("insert into listing_images(listing_id,path,position) values ($1,$2,$3)", [listing.id, `x${i}`, 10 + i]));
    await add(1); await add(2);
    await expect(add(3)).rejects.toThrow(/PHOTO_LIMIT/);
  });
  it("treats an expired paid plan as K-Leg straight away", async () => {
    const plan = await asSystem(async (db) => {
      const odogwu = await db.one("select id from subscription_plans where code='odogwu'");
      await db.run("update subscriptions set status='replaced' where seller_id=$1", [seller2.id]);
      await db.run("insert into subscriptions(seller_id,plan_id,expires_at) values ($1,$2, now()-interval '1 day')", [seller2.id, odogwu.id]);
      return db.one("select * from effective_plan($1)", [seller2.id]);
    });
    expect(plan.code).toBe("k-leg");
  });
  it("needs approval before a seller can publish", async () => {
    await expect(asUser(seller.id, (db) => db.run(
      "insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,status) select $1,category_id,'product','sneak','Sneak','desc here',1,'active' from listings limit 1", [store2.id]))).rejects.toThrow();
    await asSystem((db) => db.run("delete from listings where slug like 'limit-test%'"));
    await expect(asUser(seller.id, (db) => db.run(
      "insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,status) values ($1,$2,'product','self-approve','Sneak','desc here',1,'active')", [store.id, listing.category_id]))).rejects.toThrow(/REVIEW_REQUIRED/);
  });
  it("keeps removed listings removed", async () => {
    await asSystem((db) => db.run("update listings set status='removed' where id=$1", [service.id]));
    await expect(asUser(seller.id, (db) => db.run("update listings set status='inactive' where id=$1", [service.id]))).rejects.toThrow(/LISTING_REMOVED/);
    await asSystem((db) => db.run("update listings set status='active' where id=$1", [service.id]));
  });
});

describe("orders", () => {
  it("uses the server's price and rejects overselling", async () => {
    const before = await asSystem((db) => db.one("select stock from products where listing_id=$1", [listing.id]));
    await cart(buyer.id, listing.id, before.stock + 1);
    await expect(placeOrders(buyer, pickup)).rejects.toThrow(/left/);
    const after = await asSystem((db) => db.one("select stock from products where listing_id=$1", [listing.id]));
    expect(after.stock).toBe(before.stock);
    await asSystem((db) => db.run("delete from cart_items"));
  });
  it("refuses unverified emails and buying from yourself", async () => {
    process.env.EMAIL_DRIVER = "outbox";
    await cart(buyer.id, listing.id);
    await expect(placeOrders({ ...buyer, email_verified_at: null }, pickup)).rejects.toThrow(/Verify/);
    await asSystem((db) => db.run("delete from cart_items"));
    await cart(seller.id, listing.id);
    await expect(placeOrders(seller, pickup)).rejects.toThrow(/own storefront/);
    await asSystem((db) => db.run("delete from cart_items"));
  });
  it("enforces the status flow, roles and pickup code, and restocks on cancel", async () => {
    const stock = async () => (await asSystem((db) => db.one("select stock from products where listing_id=$1", [listing.id]))).stock;
    const s0 = await stock();
    await cart(buyer.id, listing.id);
    const { orderIds: [o] } = await placeOrders(buyer, pickup);
    expect(await stock()).toBe(s0 - 1);
    await expect(changeOrderStatus(seller2 as any, o.id, "accepted")).rejects.toThrow(/access/);
    await expect(changeOrderStatus(buyer, o.id, "accepted")).rejects.toThrow();
    await expect(changeOrderStatus(seller, o.id, "completed")).rejects.toThrow(/allowed/);
    await changeOrderStatus(seller, o.id, "accepted");
    await expect(changeOrderStatus(buyer, o.id, "cancelled")).rejects.toThrow(/before the seller/);
    await changeOrderStatus(seller, o.id, "ready_for_pickup");
    await expect(changeOrderStatus(seller, o.id, "completed", { code: "000000" })).rejects.toThrow(/pickup code/);
    const row = await asSystem((db) => db.one("select pickup_code from orders where id=$1", [o.id]));
    await changeOrderStatus(seller, o.id, "completed", { code: row.pickup_code });
    await expect(asSystem((db) => db.run("update orders set status='pending' where id=$1", [o.id]))).rejects.toThrow(/ORDER_TRANSITION/);
    await cart(buyer.id, listing.id);
    const { orderIds: [o2] } = await placeOrders(buyer, pickup);
    const s1 = await stock();
    await changeOrderStatus(buyer, o2.id, "cancelled");
    expect(await stock()).toBe(s1 + 1);
  });
});

describe("email gating", () => {
  it("enforces email verification only when email can really be sent", async () => {
    const saved = process.env.EMAIL_DRIVER; delete process.env.EMAIL_DRIVER; delete process.env.RESEND_API_KEY;
    await cart(buyer.id, listing.id);
    const r = await placeOrders({ ...buyer, email_verified_at: null }, pickup);
    expect(r.orderIds.length).toBe(1);
    process.env.EMAIL_DRIVER = "outbox";
    await cart(buyer.id, listing.id);
    await expect(placeOrders({ ...buyer, email_verified_at: null }, pickup)).rejects.toThrow(/Verify/);
    process.env.EMAIL_DRIVER = saved ?? ""; await asSystem((db) => db.run("delete from cart_items"));
  });
});

describe("payment providers", () => {
  it("accepts a Paystack webhook only with a valid signature", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
    const raw = JSON.stringify({ event: "charge.success", data: { id: 1, reference: "R1" } });
    const good = createHmac("sha512", "sk_test_x").update(raw).digest("hex");
    expect(providers.paystack.parseWebhook(raw, new Headers({ "x-paystack-signature": good }))?.reference).toBe("R1");
    expect(providers.paystack.parseWebhook(raw, new Headers({ "x-paystack-signature": "bad" }))).toBeNull();
    expect(providers.paystack.parseWebhook(raw + " ", new Headers({ "x-paystack-signature": good }))).toBeNull();
  });
  it("accepts a Flutterwave webhook only with the shared hash", () => {
    process.env.FLUTTERWAVE_WEBHOOK_HASH = "hash123";
    const raw = JSON.stringify({ event: "charge.completed", data: { id: 2, tx_ref: "R2" } });
    expect(providers.flutterwave.parseWebhook(raw, new Headers({ "verif-hash": "hash123" }))?.reference).toBe("R2");
    expect(providers.flutterwave.parseWebhook(raw, new Headers({ "verif-hash": "nope123" }))).toBeNull();
  });
});

describe("daily sweep", () => {
  it("expires plans, deactivates over-limit listings and grants credits once", async () => {
    await asSystem(async (db) => {
      const odogwu = await db.one("select id from subscription_plans where code='odogwu'");
      await db.run("update subscriptions set status='replaced' where seller_id=$1 and status='active'", [buyer2.id]);
      await db.run("insert into subscriptions(seller_id,plan_id,expires_at) values ($1,$2, now()+interval '5 days')", [buyer2.id, odogwu.id]);
    });
    await runSweep(); await runSweep();
    const credits = await asSystem((db) => db.one("select coalesce(sum(delta),0)::int n from boost_credit_ledger where seller_id=$1", [buyer2.id]));
    expect(credits.n).toBe(3);
    const r = await asSystem((db) => db.one("select status from subscriptions where seller_id=$1 and expires_at < now() order by created_at desc limit 1", [seller2.id]));
    expect(r.status).toBe("expired");
  });
});
