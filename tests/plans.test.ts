import { execSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The signed-in user and their cookies, chosen per test.
let as: any = null;
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => jar.set(k, v) }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  const fb = () => Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), { digest: "NEXT_HTTP_ERROR_FALLBACK;403" });
  const need = () => { if (!as) throw new Error("NEXT_REDIRECT login"); return as; };
  return { ...real, currentUser: async () => as, requireUser: async () => need(),
    requireSeller: async () => { const u = need(); if (u.role !== "seller" && u.role !== "admin") throw new Error("NEXT_REDIRECT"); return u; },
    requireAdmin: async () => { const u = need(); if (u.role !== "admin") throw fb(); return u; } };
});

import { createStorefront, moveStorefront, sellerContext, switchStore } from "@/app/actions/seller";
import { publishDesign, saveDraft, uploadRive } from "@/app/actions/storefront";
import { saveFeatureRule, savePlanNumbers } from "@/app/actions/admin-storefront";
import { asSystem, asUser } from "@/lib/db";
import { canUseMedia, resolveDesign } from "@/lib/storefront-access";
import { designFromTemplate, layer, TEMPLATES, type Design } from "@/lib/storefront-catalog";
import { accessFor, loadCatalog, syncStoreLimits } from "@/lib/storefront";
import { recordVisit, sourceOf, storeStats } from "@/lib/storefront-stats";

const fd = (o: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
let seller: any, admin: any, buyer: any, first: any;
const setPlan = (code: string | null, id = seller.id) => asSystem(async (db) => {
  await db.run("update subscriptions set status='expired' where seller_id=$1 and status='active'", [id]);
  if (code) await db.run("insert into subscriptions(seller_id,plan_id,expires_at) select $1,id,now()+interval '30 days' from subscription_plans where code=$2", [id, code]);
});
const myStores = () => asSystem((db) => db.rows("select id, name, position, slug from storefronts where owner_id=$1 order by position, created_at", [seller.id]));
const publicSees = (id: string) => asUser(buyer.id, (db) => db.one("select 1 from storefronts where id=$1", [id])).then(Boolean);
const kleg = TEMPLATES.find((t) => t.min_plan_code === "k-leg")!;

beforeAll(async () => {
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts --sample", { env: { ...process.env, SEED_PASSWORD: "campora-dev-1" }, stdio: "pipe" });
  await asSystem(async (db) => {
    seller = await db.one("select * from users where email='kicks@campora.test'");
    admin = await db.one("select * from users where role='admin' limit 1");
    buyer = await db.one("select * from users where role='customer' limit 1");
    first = await db.one("select * from storefronts where owner_id=$1", [seller.id]);
  });
}, 60000);
beforeEach(async () => { as = seller; jar.clear(); await setPlan(null); });

describe("storefronts per plan", () => {
  it("K-Leg gets 1, No Dulling 3 and Odogwu 5, enforced in the app and the database", async () => {
    expect((await createStorefront({}, fd({ name: "Second Shop" }))).error).toMatch(/K-Leg plan includes 1 storefront/);
    // Even straight to the database, a K-Leg seller can't open a second store.
    await expect(asUser(seller.id, (db) => db.run("insert into storefronts(owner_id,university_id,slug,name) values ($1,$2,'sneaky-store','Sneaky')", [seller.id, seller.university_id]))).rejects.toThrow(/STORE_LIMIT/);
    await setPlan("no-dulling");
    expect((await createStorefront({}, fd({ name: "Chops Corner" }))).ok).toBe(true);
    expect((await createStorefront({}, fd({ name: "Print House" }))).ok).toBe(true);
    expect((await createStorefront({}, fd({ name: "One Too Many" }))).error).toMatch(/No Dulling plan includes 3 storefronts/);
    expect((await myStores()).map((s) => s.name)).toEqual([first.name, "Chops Corner", "Print House"]);
    await setPlan("odogwu");
    expect((await createStorefront({}, fd({ name: "Fourth" }))).ok).toBe(true);
    expect((await createStorefront({}, fd({ name: "Fifth" }))).ok).toBe(true);
    expect((await createStorefront({}, fd({ name: "Sixth" }))).error).toMatch(/Odogwu plan includes 5 storefronts/);
  });

  it("the dashboard works on the store you pick, and only stores you own", async () => {
    await setPlan("odogwu");
    const [, second] = await myStores();
    expect((await sellerContext()).store.id).toBe(first.id);
    expect((await switchStore({}, fd({ storefront_id: second.id }))).ok).toBe(true);
    expect((await sellerContext()).store.id).toBe(second.id);
    const other = await asSystem((db) => db.one("select id from storefronts where owner_id<>$1 limit 1", [seller.id]));
    expect((await switchStore({}, fd({ storefront_id: other.id }))).error).toMatch(/isn't yours/);
    jar.set("vybe_store", other.id); // a forged cookie is ignored
    expect((await sellerContext()).store.id).toBe(first.id);
  });

  it("a downgrade pauses extra stores without deleting anything, tells the seller once, and the seller picks which stay live", async () => {
    await setPlan("odogwu");
    const all = await myStores();
    expect(all).toHaveLength(5);
    for (const s of all) expect(await publicSees(s.id)).toBe(true);
    await setPlan("no-dulling");
    const live = await Promise.all(all.map((s) => publicSees(s.id)));
    expect(live).toEqual([true, true, true, false, false]);
    expect(await syncStoreLimits(seller.id)).toBe(2);
    expect(await syncStoreLimits(seller.id)).toBe(0); // only told once
    const note = await asSystem((db) => db.one("select title, body from notifications where user_id=$1 order by created_at desc limit 1", [seller.id]));
    expect(note.title).toBe("2 storefronts paused"); expect(note.body).toMatch(/Nothing was deleted/);
    // Make the fifth store the main one: it goes live and the third pauses instead.
    expect((await moveStorefront({}, fd({ storefront_id: all[4].id, dir: "top" }))).ok).toBe(true);
    expect(await publicSees(all[4].id)).toBe(true); expect(await publicSees(all[2].id)).toBe(false);
    expect(await asSystem((db) => db.one("select count(*)::int n from storefronts where owner_id=$1", [seller.id]))).toEqual({ n: 5 });
    await setPlan("odogwu");
    for (const s of all) expect(await publicSees(s.id)).toBe(true);
    await moveStorefront({}, fd({ storefront_id: first.id, dir: "top" }));
  });

  it("listings in a paused store are hidden too, and the listing limit is shared across stores", async () => {
    await setPlan("odogwu");
    while ((await myStores()).length < 2) await createStorefront({}, fd({ name: `Extra ${Date.now()}` }));
    const [, second] = await myStores();
    const lid = (await asSystem((db) => db.one("select id from listings where storefront_id=$1 and status='active' limit 1", [first.id]))).id;
    await asSystem((db) => db.run("update listings set storefront_id=$2 where id=$1", [lid, second.id]));
    await setPlan(null); // K-Leg: only the main store is live
    expect(await asUser(buyer.id, (db) => db.one("select 1 from listing_cards where id=$1", [lid]))).toBeNull();
    await setPlan("odogwu");
    expect(await asUser(buyer.id, (db) => db.one("select 1 from listing_cards where id=$1", [lid]))).toBeTruthy();
    await asSystem((db) => db.run("update listings set storefront_id=$2 where id=$1", [lid, first.id]));
    // K-Leg allows 5 active listings in total, counted across every store the seller owns.
    await setPlan(null);
    const used = (await asSystem((db) => db.one("select count(*)::int n from listings l join storefronts s on s.id=l.storefront_id where s.owner_id=$1 and l.status in ('active','pending_review')", [seller.id]))).n;
    const cat = await asSystem((db) => db.one("select id from categories limit 1"));
    const add = (sid: string, i: number) => asSystem((db) => db.run(
      "insert into listings(storefront_id,category_id,kind,title,slug,description,price_kobo,status,approved_at) values ($1,$2,'product',$3,$4,'A test item',100000,'draft',now())", [sid, cat.id, `Test ${i}`, `test-${i}-${Date.now()}`]));
    for (let i = used; i < 5; i++) { await add(second.id, i); await asUser(seller.id, (db) => db.run("update listings set status='active' where slug like $1", [`test-${i}-%`])); }
    await add(second.id, 99);
    await expect(asUser(seller.id, (db) => db.run("update listings set status='active' where slug like 'test-99-%'"))).rejects.toThrow(/LISTING_LIMIT.*across your storefronts/);
  });
});

describe("design features by plan", () => {
  const base = (): Design => designFromTemplate(kleg);
  const tryDraft = (patch: (d: Design) => Design) => saveDraft({}, fd({ design: JSON.stringify(patch(base())) }));
  const st = (p: Partial<Design["style"]>) => (d: Design) => ({ ...d, style: { ...d.style, ...p } });

  it("K-Leg is refused every premium option on the server", async () => {
    for (const [patch, msg] of [
      [(d: Design) => ({ ...d, hero: { ...d.hero, parallax: true } }), /Parallax/],
      [st({ nav: "pills" }), /Navigation styles/], [st({ productLayout: "list" }), /List product layout/], [st({ productLayout: "carousel" }), /Showcase/],
      [st({ background: "dots" }), /More page backgrounds/], [st({ background: "mesh" }), /Premium page backgrounds/],
      [st({ transition: "rise" }), /Section animations/], [st({ transition: "cinema" }), /Cinematic/], [st({ hero: "split" }), /Advanced hero/],
      [st({ headingCase: "upper" }), /Premium typography/], [st({ intensity: 1.3 }), /intensity/i], [st({ navLabels: { products: "Menu" } }), /navigation labels/i],
      [(d: Design) => ({ ...d, sections: d.sections.map((x) => ({ ...x, tone: "surface" as const })) }), /Section backgrounds/],
      [(d: Design) => ({ ...d, sections: d.sections.map((x) => ({ ...x, width: "wide" as const })) }), /section positioning/],
      [(d: Design) => ({ ...d, effects: [layer("aurora", { speed: 2 })] }), /More animation controls/],
      [(d: Design) => ({ ...d, effects: [layer("aurora", { x: 20 })] }), /animation positioning/],
      [(d: Design) => ({ ...d, effects: [layer("aurora", { layer: "front" })] }), /graphic layering/],
    ] as const) expect((await tryDraft(patch as (d: Design) => Design)).error, String(msg)).toMatch(msg);
    // Free options still work, and K-Leg now has one anime scene.
    expect((await tryDraft(st({ background: "gradient", transition: "fade" }))).ok).toBe(true);
    expect((await tryDraft((d) => ({ ...d, effects: [layer("clouds")] }))).ok).toBe(true);
  });

  it("No Dulling gets the middle tier and Odogwu gets everything", async () => {
    await setPlan("no-dulling");
    expect((await tryDraft((d) => st({ nav: "pills", productLayout: "list", background: "dots", transition: "rise", hero: "split" })({ ...d, hero: { ...d.hero, parallax: true }, effects: [layer("rain", { speed: 2 })] }))).ok).toBe(true);
    expect((await tryDraft(st({ productLayout: "spotlight" }))).error).toMatch(/Odogwu/);
    expect((await tryDraft(st({ transition: "cinema" }))).error).toMatch(/Odogwu/);
    await setPlan("odogwu");
    const all = (d: Design): Design => ({
      ...st({ nav: "floating", productLayout: "spotlight", background: "mesh", transition: "cinema", hero: "arch", card: "polaroid", headingCase: "upper", tracking: 4, intensity: 1.4, navLabels: { products: "Menu" } })(d),
      sections: d.sections.map((x) => ({ ...x, tone: "accent" as const, width: "wide" as const })),
      effects: [layer("orbit-crystal", { x: 10, layer: "front", scope: "page", speed: 2 })],
    });
    expect((await saveDraft({}, fd({ design: JSON.stringify(all(base())) }))).ok).toBe(true);
    expect((await publishDesign({}, fd({}))).ok).toBe(true);
    // After a downgrade the store shows a safe version; the saved design keeps every choice for an upgrade.
    await setPlan(null);
    const c = await asSystem(loadCatalog); const a = await asSystem((db) => accessFor(db, seller.id));
    const saved = (await asSystem((db) => db.one("select published from storefront_designs where storefront_id=$1", [first.id]))).published as Design;
    const r = resolveDesign(saved, a, c, new Map());
    expect(r.design.style).toMatchObject({ nav: "bar", productLayout: "grid", background: "none", transition: "fade", hero: null, card: null, headingCase: "normal", intensity: 1, navLabels: {} });
    expect(r.design.sections.every((x) => x.tone === "plain" && x.width === "normal")).toBe(true);
    expect(saved.style.background).toBe("mesh");
  });

  it("menu labels can't carry markup", async () => {
    await setPlan("odogwu");
    expect((await tryDraft(st({ navLabels: { products: "<script>" } }))).error).toMatch(/letters, numbers/);
  });

  it("GIF banners are limited to 2 MB on K-Leg, and Rive files are checked by their bytes", async () => {
    const a = await asSystem((db) => accessFor(db, seller.id));
    expect([canUseMedia(a, "gif", 1_500_000), canUseMedia(a, "gif", 3_000_000), canUseMedia(a, "video", 1000)]).toEqual([true, false, false]);
    expect((await uploadRive({}, fd({ rights: "on", file: new File(["RIVE"], "a.riv") }))).error).toMatch(/Odogwu/);
    await setPlan("no-dulling");
    const nd = await asSystem((db) => accessFor(db, seller.id));
    expect([canUseMedia(nd, "gif", 3_000_000), canUseMedia(nd, "video", 1000)]).toEqual([true, true]);
    await setPlan("odogwu");
    expect((await uploadRive({}, fd({ rights: "on", file: new File(["PNG fake"], "a.riv") }))).error).toMatch(/isn't a Rive/);
    expect((await uploadRive({}, fd({ rights: "on", file: new File([new Uint8Array([82, 73, 86, 69, 7, 0, 0, 0])], "a.riv") }))).ok).toBe(true);
  });
});

describe("admin plan controls", () => {
  it("only admins can change plans, and changes apply straight away", async () => {
    await expect(saveFeatureRule({}, fd({ key: "nav_style", min_plan_code: "k-leg" }))).rejects.toThrow(/403/);
    as = admin;
    expect((await saveFeatureRule({}, fd({ key: "nav_style", min_plan_code: "k-leg" }))).ok).toBe(true);
    expect((await savePlanNumbers({}, fd({ code: "k-leg", storefront_limit: "2", effect_layers: "3" }))).ok).toBe(true);
    as = seller;
    const a = await asSystem((db) => accessFor(db, seller.id));
    expect([a.features.nav_style, a.storefronts, a.layers]).toEqual([true, 2, 3]);
    as = admin;
    await saveFeatureRule({}, fd({ key: "nav_style", min_plan_code: "no-dulling" }));
    await savePlanNumbers({}, fd({ code: "k-leg", storefront_limit: "1", effect_layers: "2" }));
  });
});

describe("traffic sources", () => {
  it("buckets referrers without storing addresses", async () => {
    expect([sourceOf(""), sourceOf("l.instagram.com"), sourceOf("wa.me"), sourceOf("t.co"), sourceOf("www.google.com.ng"), sourceOf("vybemarket.vercel.app", "vybemarket.vercel.app"), sourceOf("example.org")])
      .toEqual(["direct", "instagram", "whatsapp", "x", "google", "vybe", "other"]);
    await asSystem((db) => db.run("delete from storefront_daily_sources where storefront_id=$1", [first.id]));
    await recordVisit(first.id, "11111111-1111-4111-8111-111111111111", null, { source: "whatsapp", device: "mobile" });
    await recordVisit(first.id, "22222222-2222-4222-8222-222222222222", null, { source: "instagram", device: "desktop" });
    const s = await storeStats(first.id, 7);
    expect(s.sources.map((x) => x.source).sort()).toEqual(["instagram", "whatsapp"]);
    expect(s.devices.map((x) => x.device).sort()).toEqual(["desktop", "mobile"]);
  });
});
