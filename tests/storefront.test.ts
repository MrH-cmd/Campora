import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Server actions read the signed-in user from these. Tests choose who is "signed in".
let as: any = null;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  const need = (role?: string) => { if (!as) throw new Error("NEXT_REDIRECT login"); if (role && as.role !== role) throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" }); return as; };
  return { ...real, currentUser: async () => as, requireUser: async () => need(), requireSeller: async () => { const u = need(); if (u.role !== "seller" && u.role !== "admin") throw new Error("NEXT_REDIRECT"); return u; }, requireAdmin: async () => need("admin") };
});

import { chooseTemplate, publishDesign, restoreDesign, saveDraft, startMediaUpload, uploadLottie } from "@/app/actions/storefront";
import { setStoreStatus } from "@/app/actions/admin-storefront";
import { asSystem, asUser } from "@/lib/db";
import { canUseTemplate, resolveDesign, violations } from "@/lib/storefront-access";
import { designFromTemplate, layer, TEMPLATES, type Design } from "@/lib/storefront-catalog";
import { parseDesign } from "@/lib/storefront-design";
import { accessFor, loadCatalog, loadContent, loadMedia, loadPublicView, mediaMap, syncDowngrade } from "@/lib/storefront";
import { checkLottie, checkMedia, inspectMedia } from "@/lib/storefront-media";
import { recordClick, recordVisit, storeStats } from "@/lib/storefront-stats";

const fd = (o: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
let seller: any, seller2: any, admin: any, store: any, store2: any;
const user = (id: string) => asSystem((db) => db.one("select id,email,full_name,role,status,student_status,university_id,email_verified_at,phone,avatar_path from users where id=$1", [id]));
const setPlan = (code: string | null, sellerId = seller.id) => asSystem(async (db) => {
  await db.run("update subscriptions set status='expired' where seller_id=$1 and status='active'", [sellerId]);
  if (code) await db.run("insert into subscriptions(seller_id,plan_id,expires_at) select $1,id,now()+interval '30 days' from subscription_plans where code=$2", [sellerId, code]);
});
const row = () => asSystem((db) => db.one("select * from storefront_designs where storefront_id=$1", [store.id]));
const catalog = () => asSystem(loadCatalog);
const tmpl = (plan: string) => TEMPLATES.find((t) => t.min_plan_code === plan)!;

beforeAll(async () => {
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts --sample", { env: { ...process.env, SEED_PASSWORD: "campora-dev-1" }, stdio: "pipe" });
  await asSystem(async (db) => {
    const a = await db.one("select id from users where email='kicks@campora.test'"); const b = await db.one("select id from users where email='wear@campora.test'");
    const c = await db.one("select id from users where role='admin' limit 1");
    seller = await user(a.id); seller2 = await user(b.id); admin = await user(c.id);
    store = await db.one("select * from storefronts where owner_id=$1", [seller.id]); store2 = await db.one("select * from storefronts where owner_id=$1", [seller2.id]);
  });
}, 60000);
beforeEach(async () => { as = seller; await setPlan(null); await asSystem((db) => db.run("delete from storefront_designs where storefront_id=$1", [store.id])); });

describe("catalogue", () => {
  it("has 50 templates: 10 per plan tier on 10 different layouts, none differing only in colour", () => {
    expect(TEMPLATES).toHaveLength(50);
    const kleg = TEMPLATES.filter((t) => t.min_plan_code === "k-leg");
    expect(kleg).toHaveLength(10); expect(new Set(kleg.map((t) => t.archetype)).size).toBe(10);
    expect(TEMPLATES.filter((t) => t.min_plan_code === "no-dulling")).toHaveLength(10);
    for (const a of TEMPLATES) for (const b of TEMPLATES) if (a !== b) {
      expect(JSON.stringify(a.config.fonts) === JSON.stringify(b.config.fonts), `${a.slug} / ${b.slug} share fonts`).toBe(false);
      expect(a.archetype === b.archetype && a.config.hero === b.config.hero, `${a.slug} / ${b.slug} share layout and hero`).toBe(false);
    }
  });
  it("rejects custom code, bad colours and off-site social links in a design", () => {
    const base = designFromTemplate(TEMPLATES[0]);
    expect(() => parseDesign({ ...base, css: "body{}" })).toThrow();
    expect(() => parseDesign({ ...base, colors: { ...base.colors, bg: "red;background:url(x)" } })).toThrow();
    expect(() => parseDesign({ ...base, effects: Array.from({ length: 7 }, () => layer("aurora")) })).toThrow();
    expect(() => parseDesign({ ...base, effects: [{ ...layer("aurora"), opacity: 5 }] })).toThrow();
    expect(parseDesign(JSON.stringify(base)).template).toBe(base.template);
  });
});

describe("plan access", () => {
  it("K-Leg sees 10 templates, No Dulling 20, Odogwu 50", async () => {
    const c = await catalog();
    for (const [code, n] of [[null, 10], ["no-dulling", 20], ["odogwu", 50]] as const) {
      await setPlan(code);
      const a = await asSystem((db) => accessFor(db, seller.id));
      expect(c.templates.filter((t) => canUseTemplate(c, a, t)).length).toBe(n);
    }
  });
  it("a K-Leg seller can pick a K-Leg template, and the server refuses a No Dulling one", async () => {
    expect((await chooseTemplate({}, fd({ slug: tmpl("k-leg").slug }))).ok).toBe(true);
    const r = await chooseTemplate({}, fd({ slug: tmpl("no-dulling").slug }));
    expect(r.error).toMatch(/needs the No Dulling plan/);
    expect((await row()).draft.template).toBe(tmpl("k-leg").slug);
  });
  it("locked effects, extra layers, type controls and parallax are refused on the server", async () => {
    const d = designFromTemplate(tmpl("k-leg"));
    const draft = (x: Partial<Design>) => saveDraft({}, fd({ design: JSON.stringify({ ...d, ...x }) }));
    expect((await draft({ effects: [layer("rain")] })).error).toMatch(/Rain needs the No Dulling plan/);
    expect((await draft({ effects: [layer("aurora"), layer("soft-glow"), layer("grid-pulse")] })).error).toMatch(/allows 2 effect layers/);
    expect((await draft({ typeScale: 1.2 })).error).toMatch(/font sizes/);
    expect((await draft({ hero: { ...d.hero, parallax: true } })).error).toMatch(/Parallax/);
    expect((await draft({ effects: [layer("aurora"), layer("soft-glow")] })).ok).toBe(true);
    // Publishing re-checks, even when the design is sent directly.
    expect((await publishDesign({}, fd({ design: JSON.stringify({ ...d, effects: [layer("orbit-crystal")] }) }))).error).toMatch(/Odogwu/);
  });
  it("GIF and video banners are refused below No Dulling, and Lottie below Odogwu", async () => {
    expect((await startMediaUpload({ kind: "video", ext: "mp4", bytes: 1000, rights: true })).error).toMatch(/No Dulling/);
    expect((await uploadLottie({}, fd({ rights: "on", file: new File(["{}"], "a.json") }))).error).toMatch(/Odogwu/);
    await setPlan("no-dulling");
    // Allowed by plan, but storage isn't configured in tests, so the seller is told plainly.
    expect((await startMediaUpload({ kind: "video", ext: "mp4", bytes: 1000, rights: true })).error).toMatch(/aren't switched on/);
    expect((await startMediaUpload({ kind: "video", ext: "mp4", bytes: 1000, rights: false as any })).error).toMatch(/rights/);
  });
});

describe("drafts and publishing", () => {
  it("saving a draft doesn't change the public page; publishing does", async () => {
    const view = () => asUser(null, (db) => loadPublicView(db, store));
    const before = (await view()).resolved.design.template;
    const t = TEMPLATES.find((x) => x.min_plan_code === "k-leg" && x.slug !== before)!;
    await chooseTemplate({}, fd({ slug: t.slug }));
    expect((await view()).resolved.design.template).toBe(before);
    expect((await publishDesign({}, fd({}))).ok).toBe(true);
    expect((await view()).resolved.design.template).toBe(t.slug);
    expect((await row()).version).toBe(1);
  });
  it("buyers can't read a seller's draft", async () => {
    await chooseTemplate({}, fd({ slug: tmpl("k-leg").slug }));
    const visible = await asUser(null, (db) => db.one("select draft from storefront_designs where storefront_id=$1", [store.id]));
    expect(visible).toBeNull();
  });
  it("switching templates keeps all store content and the banner, sections and product settings", async () => {
    const content = () => asUser(seller.id, (db) => loadContent(db, store));
    const before = await content();
    const d = designFromTemplate(tmpl("k-leg"));
    d.sections = [...d.sections].reverse(); d.sections[0].visible = false; d.products = { columns: 2, showStock: false, showRating: true };
    await saveDraft({}, fd({ design: JSON.stringify(d) }));
    for (const t of TEMPLATES.filter((x) => x.min_plan_code === "k-leg").slice(1, 4)) {
      await chooseTemplate({}, fd({ slug: t.slug }));
      const draft = (await row()).draft as Design;
      expect(draft.template).toBe(t.slug); expect(draft.sections).toEqual(d.sections); expect(draft.products).toEqual(d.products);
    }
    expect(await content()).toEqual(before);
  });
});

describe("store products match listings", () => {
  it("prices and stock on the store page come straight from the listings", async () => {
    const c = await asUser(null, (db) => loadContent(db, store));
    const cards = await asUser(null, (db) => db.rows("select id, effective_price_kobo, price_kobo, in_stock, stock from listing_cards where storefront_id=$1 and status='active'", [store.id]));
    expect(c.items.length).toBe(cards.length);
    for (const card of cards) {
      const i = c.items.find((x) => x.id === card.id)!;
      expect([i.effective_price_kobo, i.price_kobo, i.in_stock, i.stock]).toEqual([Number(card.effective_price_kobo), Number(card.price_kobo), card.in_stock, card.stock]);
    }
  });
});

describe("uploads", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const mp4 = (seconds: number) => {
    const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(8 + body.length); h.write(type, 4, "latin1"); return Buffer.concat([h, body]); };
    const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(seconds * 1000, 16);
    return Buffer.concat([box("ftyp", Buffer.from("isom0000isomavc1", "latin1")), box("moov", box("mvhd", mvhd))]);
  };
  it("checks real bytes, not file names", () => {
    expect(() => checkMedia("video", inspectMedia(png), png.length)).toThrow(/isn't a real MP4/);
    expect(() => checkMedia("gif", inspectMedia(mp4(5)), 100)).toThrow(/isn't a real GIF/);
    expect(() => checkMedia("video", inspectMedia(Buffer.from("<html><script>")), 14)).toThrow();
    expect(checkMedia("video", inspectMedia(mp4(12)), 5000).durationMs).toBe(12000);
  });
  it("rejects oversized and overlong media", () => {
    expect(() => checkMedia("video", inspectMedia(mp4(25)), 5000)).toThrow(/at most 20 seconds/);
    expect(() => checkMedia("video", inspectMedia(mp4(10)), 16 * 1024 * 1024)).toThrow(/15 MB/);
    const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(10)]);
    expect(() => checkMedia("gif", inspectMedia(gif), 9 * 1024 * 1024)).toThrow(/8 MB/);
  });
  it("refuses Lottie files with scripts or remote images", () => {
    const ok = { v: "5.7.0", fr: 30, ip: 0, op: 60, w: 100, h: 100, layers: [] };
    expect(checkLottie(JSON.stringify(ok)).durationMs).toBe(2000);
    expect(() => checkLottie(JSON.stringify({ ...ok, layers: [{ ks: { o: { x: "var $bm_rt = 1" } } }] }))).toThrow(/expressions/);
    expect(() => checkLottie(JSON.stringify({ ...ok, assets: [{ p: "https://evil.example/x.png" }] }))).toThrow(/another site/);
    expect(() => checkLottie("not json")).toThrow();
  });
  it("Odogwu sellers can upload a clean Lottie file", async () => {
    await setPlan("odogwu");
    const file = new File([JSON.stringify({ v: "5.7.0", fr: 30, ip: 0, op: 30, w: 50, h: 50, layers: [] })], "a.json", { type: "application/json" });
    expect((await uploadLottie({}, fd({ rights: "on", file }))).ok).toBe(true);
    expect((await uploadLottie({}, fd({ file }))).error).toBeTruthy(); // rights box not ticked
  });
});

describe("downgrades", () => {
  it("the store keeps working, locked parts fall back, the seller is told, and upgrading restores the design", async () => {
    await setPlan("odogwu");
    const fancy = TEMPLATES.find((t) => t.min_plan_code === "odogwu")!;
    await chooseTemplate({}, fd({ slug: fancy.slug }));
    const d = (await row()).draft as Design;
    const full = { ...d, typeScale: 1.15, hero: { ...d.hero, parallax: true }, effects: [layer("speed-lines"), layer("rain"), layer("aurora")] };
    expect((await publishDesign({}, fd({ design: JSON.stringify(full) }))).ok).toBe(true);

    await setPlan(null); // plan lapses
    const v = await asUser(null, (db) => loadPublicView(db, store));
    expect(v.resolved.template.min_plan_code).toBe("k-leg");
    expect(v.resolved.template.archetype).toBe(fancy.archetype); // closest K-Leg layout
    expect(v.resolved.design.effects.map((e) => e.asset)).toEqual(["aurora"]);
    expect(v.resolved.design.hero.parallax).toBe(false); expect(v.resolved.design.typeScale).toBe(1);
    expect((await syncDowngrade(store.id)).length).toBeGreaterThan(0);
    const note = await asSystem((db) => db.one("select title from notifications where user_id=$1 order by created_at desc limit 1", [seller.id]));
    expect(note.title).toMatch(/design changed with your plan/);
    expect(((await row()).published as Design).effects).toHaveLength(3); // saved design untouched

    await setPlan("odogwu");
    const back = await asUser(null, (db) => loadPublicView(db, store));
    expect(back.resolved.design.template).toBe(fancy.slug); expect(back.resolved.design.effects).toHaveLength(3); expect(back.resolved.fallbacks).toEqual([]);
  });
  it("a seller who picks replacements after a downgrade can restore the old design after upgrading", async () => {
    await setPlan("odogwu");
    const fancy = TEMPLATES.find((t) => t.min_plan_code === "odogwu")!;
    await chooseTemplate({}, fd({ slug: fancy.slug })); await publishDesign({}, fd({}));
    await setPlan(null);
    expect((await chooseTemplate({}, fd({ slug: tmpl("k-leg").slug }))).ok).toBe(true);
    expect((await publishDesign({}, fd({}))).ok).toBe(true);
    expect((await restoreDesign({}, fd({}))).error).toMatch(/doesn't cover/);
    await setPlan("odogwu");
    expect((await restoreDesign({}, fd({}))).ok).toBe(true);
    expect(((await row()).published as Design).template).toBe(fancy.slug);
  });
});

describe("ownership", () => {
  it("a seller can't touch another seller's design through the database", async () => {
    await asSystem((db) => db.run("insert into storefront_designs(storefront_id, draft) values ($1, '{}') on conflict do nothing", [store2.id]));
    const n = await asUser(seller.id, (db) => db.one("with u as (update storefront_designs set draft='{}' where storefront_id=$1 returning 1) select count(*)::int n from u", [store2.id]));
    expect(n.n).toBe(0);
    await expect(asUser(seller.id, (db) => db.run("insert into storefront_designs(storefront_id, draft) values ($1,'{}')", [randomUUID()]))).rejects.toThrow();
    // Even on their own row, sellers can't write the published design directly; only the server's publish step can.
    await expect(asUser(seller2.id, (db) => db.run("update storefront_designs set published='{}' where storefront_id=$1", [store2.id]))).rejects.toThrow(/permission/);
    await expect(asUser(seller.id, (db) => db.run("insert into storefront_media(storefront_id, kind, path, mime) values ($1,'image','x','image/png')", [store.id]))).rejects.toThrow(/permission/);
  });
  it("actions only ever act on the signed-in seller's own store", async () => {
    as = seller2;
    await chooseTemplate({}, fd({ slug: tmpl("k-leg").slug }));
    expect(await row()).toBeNull(); // seller 1's store untouched
  });
});

describe("analytics", () => {
  it("each tracked event raises its counter, and owners and repeat visits are handled", async () => {
    await asSystem((db) => db.run("delete from storefront_daily_stats where storefront_id=$1", [store.id]));
    const v = randomUUID();
    await recordVisit(store.id, v, null); await recordVisit(store.id, v, null); await recordVisit(store.id, randomUUID(), null);
    await recordVisit(store.id, randomUUID(), seller.id); // the owner looking at their own store
    await recordClick(store.id, v, null); await recordClick(store.id, randomUUID(), null); // second click is from a browser that never visited
    const s = await storeStats(store.id, 7);
    expect([s.visits, s.unique, s.clicks]).toEqual([3, 2, 1]);
    const hashes = await asSystem((db) => db.rows("select visitor_hash from storefront_visitor_days where storefront_id=$1", [store.id]));
    expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h.visitor_hash) && !h.visitor_hash.includes(v))).toBe(true);
  });
  it("counts a completed order as a store sale only if the buyer visited while logged in", async () => {
    const buyer = await asSystem((db) => db.one("select id from users where role not in ('seller','admin') limit 1"));
    const o = await asSystem((db) => db.one(
      `insert into orders(number,buyer_id,storefront_id,status,payment_method,payment_status,subtotal_kobo,total_kobo,pickup_code)
       values ($1,$2,$3,'completed','pay_on_pickup','collected',100000,100000,'1234') returning id, storefront_id, buyer_id`, [`T${Date.now()}`, buyer.id, store.id]));
    await asSystem((db) => db.run("delete from storefront_member_visits where storefront_id=$1 and user_id=$2", [o.storefront_id, o.buyer_id]));
    const before = (await storeStats(o.storefront_id, 7)).orders;
    await recordVisit(o.storefront_id, randomUUID(), o.buyer_id);
    expect((await storeStats(o.storefront_id, 7)).orders).toBe(before + 1);
  });
});

describe("admin", () => {
  it("admins can hide a store with a reason; sellers can't", async () => {
    as = seller;
    await expect(setStoreStatus({}, fd({ id: store2.id, status: "hidden", reason: "x" }))).rejects.toThrow(/403/);
    as = admin;
    expect((await setStoreStatus({}, fd({ id: store2.id, status: "hidden" }))).error).toMatch(/reason/);
    expect((await setStoreStatus({}, fd({ id: store2.id, status: "hidden", reason: "Copyrighted banner" }))).ok).toBe(true);
    expect(await asUser(null, (db) => db.one("select 1 from storefronts where id=$1", [store2.id]))).toBeNull();
    expect((await asSystem((db) => db.one("select action from admin_activity_logs order by created_at desc limit 1"))).action).toBe("storefront.status");
    await setStoreStatus({}, fd({ id: store2.id, status: "active" }));
  });
});

describe("admins", () => {
  it("get the top plan everywhere and can use every locked feature without paying", async () => {
    const plan = await asSystem((db) => db.one("select code, listing_limit from effective_plan($1)", [admin.id]));
    expect(plan.code).toBe("odogwu");
    const c = await catalog(); const a = await asSystem((db) => accessFor(db, admin.id));
    expect(c.templates.filter((t) => canUseTemplate(c, a, t)).length).toBe(50);
    await asSystem((db) => db.run(
      "insert into storefronts(owner_id,university_id,slug,name) select $1, university_id, 'admin-store', 'Admin Store' from storefronts where id=$2 on conflict do nothing", [admin.id, store.id]));
    as = { ...admin, university_id: store.university_id };
    expect((await chooseTemplate({}, fd({ slug: TEMPLATES.find((t) => t.min_plan_code === "odogwu")!.slug }))).ok).toBe(true);
    const d = (await asSystem((db) => db.one("select draft from storefront_designs d join storefronts s on s.id=d.storefront_id where s.owner_id=$1", [admin.id]))).draft as Design;
    const full = { ...d, typeScale: 1.2, hero: { ...d.hero, parallax: true }, effects: [layer("orbit-crystal"), layer("speed-lines"), layer("rain"), layer("aurora"), layer("lightning"), layer("starfield")] };
    expect((await publishDesign({}, fd({ design: JSON.stringify(full) }))).ok).toBe(true);
    const { choosePlan } = await import("@/app/actions/seller");
    const odogwu = await asSystem((db) => db.one("select id from subscription_plans where code='odogwu'"));
    expect((await choosePlan({}, fd({ plan_id: odogwu.id }))).error).toMatch(/Admins already have/);
  });
  it("leave ordinary sellers on their own plan", async () => {
    expect((await asSystem((db) => db.one("select code from effective_plan($1)", [seller.id]))).code).toBe("k-leg");
  });
});

describe("granting admin", () => {
  it("needs the acting admin's password, unlocks everything, is logged without the password, and can be removed", async () => {
    const { setUserRole } = await import("@/app/actions/admin");
    const target = seller2;
    as = seller;
    await expect(setUserRole({}, fd({ user_id: target.id, make: "admin", password: "campora-dev-1" }))).rejects.toThrow(/403/);
    as = admin;
    expect((await setUserRole({}, fd({ user_id: target.id, make: "admin", password: "wrong" }))).error).toMatch(/password isn't right/);
    expect((await user(target.id)).role).toBe("seller");
    expect((await setUserRole({}, fd({ user_id: target.id, make: "admin", password: "campora-dev-1" }))).ok).toBe(true);
    expect((await user(target.id)).role).toBe("admin");
    expect((await asSystem((db) => db.one("select code from effective_plan($1)", [target.id]))).code).toBe("odogwu");
    const log = await asSystem((db) => db.one("select action, meta from admin_activity_logs order by created_at desc limit 1"));
    expect(log.action).toBe("user.role"); expect(JSON.stringify(log.meta)).not.toContain("campora-dev-1");
    expect((await setUserRole({}, fd({ user_id: admin.id, make: "remove" }))).error).toMatch(/your own/);
    expect((await setUserRole({}, fd({ user_id: target.id, make: "remove" }))).ok).toBe(true);
    expect((await user(target.id)).role).toBe("seller"); // owns a store, so goes back to seller
  });
});

describe("resolve is pure", () => {
  it("never edits the design it's given", async () => {
    const c = await catalog(); const a = await asSystem((db) => accessFor(db, seller.id));
    const d = { ...designFromTemplate(TEMPLATES[49]), effects: [layer("lightning")] };
    const copy = JSON.stringify(d);
    resolveDesign(d, a, c, mediaMap(await asSystem((db) => loadMedia(db, store.id))));
    expect(JSON.stringify(d)).toBe(copy);
    expect(violations(d, a, c, new Map()).length).toBeGreaterThan(0);
  });
});
