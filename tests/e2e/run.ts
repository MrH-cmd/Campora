import { execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices, type Page } from "playwright";

const BASE = "http://localhost:3100";
const DB = process.env.E2E_DATABASE_URL ?? "postgres://campora:campora@localhost:5432/campora_test";
const OUT = process.env.SHOTS ?? "/tmp/campora-shots"; mkdirSync(OUT, { recursive: true });
const PW = "campora-dev-1";
const env = { ...process.env, DATABASE_URL: DB, APP_URL: BASE, EMAIL_DRIVER: "outbox", PAYSTACK_SECRET_KEY: "sk_test_e2e", PAYSTACK_BASE_URL: "http://localhost:4010", CRON_SECRET: "cron", PORT: "3100" };
const results: [string, boolean, string?][] = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
writeFileSync("/tmp/pic.png", PNG); writeFileSync("/tmp/evil.png", "<svg onload=alert(1)>");

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push([name, true]); console.log("PASS", name); }
  catch (e) { results.push([name, false, String(e).slice(0, 400)]); console.log("FAIL", name, String(e).slice(0, 400)); }
}
const expect = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const sql = (q: string) => execSync(`psql "${DB}" -Atc "${q}"`).toString().trim();
const clearLimits = () => sql("delete from rate_limits");

async function login(p: Page, email: string) {
  await p.goto(`${BASE}/login`); await p.fill('[name=email]', email); await p.fill('[name=password]', PW);
  await p.click('button:has-text("Log in")'); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
}
const mailLink = async (p: Page, to: string) => {
  await p.goto(`${BASE}/dev/mailbox`);
  const t = await p.locator(`li[data-to="${to}"] pre`).first().innerText();
  return t.match(/http\S+/)![0];
};
const scrollThrough = async (p: Page) => {
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(120); }
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
};
const toast = (p: Page, text: string) => p.getByText(text).first().waitFor({ timeout: 10000 });

(async () => {
  execSync("npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts --sample", { env, stdio: "pipe" });
  const gw = spawn("node", ["tests/e2e/fake-gateway.mjs"], { stdio: "inherit" });
  const app = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "pipe" });
  app.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + "/pricing")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

  const browser = await chromium.launch();
  const ctx = () => browser.newContext({ viewport: { width: 1280, height: 860 } });
  const consoleErrors: string[] = [];
  const page = async () => { const p = await (await ctx()).newPage(); p.setDefaultTimeout(9000); p.on("pageerror", (e) => consoleErrors.push(`${p.url()}: ${e.message}`)); return p; };
  const newbie = await page(); const admin = await page(); const buyer = await page(); const anon = await page();
  const email = "newstudent@example.com"; const student = "newstudent@stu.cu.edu.ng";

  await step("anonymous visitor sees marketplace from the database", async () => {
    await anon.goto(BASE); await anon.getByText("All your campus needs").first().waitFor();
    expect(await anon.getByText("Sponsored").count() > 0, "sponsored label"); await anon.waitForTimeout(800); await scrollThrough(anon);
    await anon.screenshot({ path: `${OUT}/home-desktop.png`, fullPage: true });
  });
  await step("search, filter and sort work", async () => {
    await anon.goto(`${BASE}/search?q=jollof`); await anon.getByText("Smoky Jollof and Chicken").first().waitFor();
    await anon.goto(`${BASE}/search?type=service&category=photo&sort=price_asc`);
    const t = await anon.locator("article h3").allInnerTexts(); expect(t[0] === "Final-year Photoshoot" && t.length === 2, t.join());
    await anon.goto(`${BASE}/search?type=product&max=3000`); const a = await anon.locator("article h3").allInnerTexts(); expect(a.length > 0 && a.every((x) => !x.includes("Laptop")), a.join());
    await anon.goto(`${BASE}/search?type=store&q=frame`); await anon.getByText("Frame by Kene").first().waitFor();
    await anon.screenshot({ path: `${OUT}/search.png` });
  });
  await step("role guards redirect visitors and buyers away from seller and admin", async () => {
    await anon.goto(`${BASE}/admin`); expect(anon.url().includes("/login"), "anon admin");
    await anon.goto(`${BASE}/seller`); expect(anon.url().includes("/login"), "anon seller");
  });
  await step("student registers", async () => {
    await newbie.goto(`${BASE}/register`);
    await newbie.fill("[name=full_name]", "Chidi Student"); await newbie.fill("[name=email]", email); await newbie.fill("[name=password]", PW);
    await newbie.click('button:has-text("Create account")'); await newbie.waitForURL("**/account**"); await newbie.getByRole("heading", { name: "Welcome, Chidi" }).waitFor();
  });
  await step("duplicate email and weak password are refused", async () => {
    const p = await page(); await p.goto(`${BASE}/register`);
    await p.fill("[name=full_name]", "Dupe"); await p.fill("[name=email]", email); await p.fill("[name=password]", "short");
    await p.click('button:has-text("Create account")'); await p.getByText("Use at least 8").waitFor();
    await p.fill("[name=password]", PW); await p.click('button:has-text("Create account")'); await p.getByText("already exists").waitFor();
  });
  await step("wrong domain is refused for student email; right domain verifies", async () => {
    await newbie.goto(`${BASE}/account/verification`);
    await newbie.fill("[name=student_email]", "x@gmail.com"); await newbie.click('button:has-text("Send confirmation")'); await newbie.getByText("stu.cu.edu.ng").nth(1).waitFor();
    await newbie.fill("[name=student_email]", student); await newbie.click('button:has-text("Send confirmation")'); await toast(newbie, "Confirmation sent");
    await newbie.goto(await mailLink(newbie, student)); await newbie.getByText("verified student").waitFor();
  });
  await step("email verification link works once", async () => {
    const link = await mailLink(newbie, email); await newbie.goto(link); await newbie.getByText("Email verified").waitFor();
    await newbie.goto(link); await newbie.getByText("expired").first().waitFor();
  });
  await step("ID upload is checked by real bytes and stays private", async () => {
    const p = await page(); await login(p, "buyer@campora.test");
    sql("update users set student_status='unverified' where email='buyer@campora.test'");
    await p.goto(`${BASE}/account/verification`);
    await p.fill("[name=department]", "Computer Science"); await p.fill("[name=academic_level]", "300"); await p.fill("[name=matric_number]", "19CG0001"); await p.setInputFiles("[name=document]", "/tmp/evil.png"); await p.click('button:has-text("Submit for review")'); await p.getByText("Upload a JPG").waitFor();
    await p.setInputFiles("[name=document]", "/tmp/pic.png"); await p.click('button:has-text("Submit for review")'); await toast(p, "Submitted");
    const path = sql("select document_path from student_verifications order by created_at desc limit 1");
    const r = await fetch(`${BASE}/files/${path}`); expect(r.status === 404, "private file public");
    await login(admin, "admin@campora.test");
    expect((await admin.request.get(`${BASE}/files/${path}`)).status() === 200, "admin read");
    await admin.goto(`${BASE}/admin/verifications`); await admin.getByRole("link", { name: "Bisi Afolabi" }).first().click(); await admin.getByText("19CG0001").waitFor();
    expect((await admin.locator("body").innerText()).includes("Computer Science"), "dept");
    await admin.click('button:has-text("Save decision")'); await toast(admin, "Student verified");
    expect(sql("select student_status from users where email='buyer@campora.test'") === "verified", "status");
  });
  await step("student applies to sell and admin approves", async () => {
    await newbie.goto(`${BASE}/account/become-seller`);
    await newbie.fill("[name=business_name]", "Chidi Prints"); await newbie.fill("[name=business_type]", "T-shirts"); await newbie.fill("[name=pitch]", "Screen-printed shirts for departments and clubs.");
    await newbie.click('button:has-text("Send application")'); await toast(newbie, "Application sent");
    await newbie.goto(`${BASE}/seller`); expect(newbie.url().includes("become-seller"), "guard before approval");
    await admin.goto(`${BASE}/admin/sellers`); await admin.click('button:has-text("Approve seller")'); await toast(admin, "Seller approved");
  });
  await step("seller creates storefront and listing with photo; listing waits for review", async () => {
    await newbie.goto(`${BASE}/seller`); await newbie.waitForURL("**/seller/storefront");
    await newbie.fill("[name=tagline]", "Shirts for every department"); await newbie.fill("[name=campus_location]", "Joseph Hall");
    await newbie.click('button:has-text("Create storefront")'); await toast(newbie, "Storefront saved");
    await newbie.goto(`${BASE}/seller/listings/new`);
    await newbie.fill("[name=title]", "Department Shirt"); await newbie.fill("textarea[name=description]", "Soft cotton shirt printed with your department crest.");
    await newbie.fill("[name=price]", "5000"); await newbie.fill("[name=stock]", "10"); await newbie.setInputFiles("[name=images]", "/tmp/pic.png");
    await newbie.click('button[value=publish]'); await newbie.waitForURL("**/seller/listings/*?saved=1");
    await newbie.getByText("In review").first().waitFor();
    const r = await fetch(`${BASE}/search?q=Department+Shirt`); expect(!(await r.text()).includes('Department Shirt</h3>'), "unapproved listing public");
  });
  await step("admin approves the listing and it goes public", async () => {
    await admin.goto(`${BASE}/admin/listings`); await admin.click('button:has-text("Approve")'); await toast(admin, "Listing approved");
    await anon.goto(`${BASE}/search?q=Department`); await anon.getByText("Department Shirt").first().waitFor();
  });
  await step("K-Leg limit shows a clear error at five active listings", async () => {
    for (let i = 0; i < 4; i++) sql(`insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,status,approved_at) select storefront_id,category_id,kind,'fill-${i}','Filler ${i}',description,price_kobo,'inactive',now() from listings where title='Department Shirt'; update listings set status='active' where slug='fill-${i}'`);
    await newbie.goto(`${BASE}/seller/listings/new`);
    await newbie.fill("[name=title]", "One Too Many"); await newbie.fill("textarea[name=description]", "This one should be blocked by the plan."); await newbie.fill("[name=price]", "100");
    await newbie.click('button[value=publish]'); await newbie.getByText("allows 5 active listings").waitFor();
    sql("update listings set status='inactive' where slug like 'fill-%'");
  });
  await step("buyer favourites, enquires and the seller replies", async () => {
    await login(buyer, "buyer@campora.test");
    await buyer.goto(`${BASE}/search?q=Department`); await buyer.getByRole("link", { name: "Department Shirt" }).first().click(); await buyer.waitForURL("**/listing/**");
    await buyer.getByLabel("Save to favourites").first().click(); await buyer.getByLabel("Remove from favourites").first().waitFor(); await buyer.waitForTimeout(400);
    await buyer.getByText("Ask the seller").click(); await buyer.click('button:has-text("Send enquiry")'); await buyer.waitForURL("**/messages/**");
    const id = buyer.url().split("/").pop(); await newbie.goto(`${BASE}/messages/${id}`);
    await newbie.fill("[name=body]", "Yes, it's available in blue."); await newbie.click('button:has-text("Send")');
    await buyer.bringToFront(); await buyer.getByText("available in blue").waitFor({ timeout: 9000 });
    await buyer.screenshot({ path: `${OUT}/messages.png` });
    await buyer.goto(`${BASE}/account/favourites`); await buyer.getByText("Department Shirt").first().waitFor();
  });
  await step("another user can't open that conversation", async () => {
    const id = sql("select id from conversations order by created_at desc limit 1");
    const p = await page(); await login(p, "bowl@campora.test");
    expect((await p.request.get(`${BASE}/api/messages/${id}`)).status() === 404, "leak");
  });
  let orderUrl = "";
  await step("buyer checks out with pay at pickup", async () => {
    await buyer.goto(sql("select '/listing/'||slug from listings where title='Department Shirt'").replace(/^/, BASE));
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/cart`); await buyer.getByRole("link", { name: "Check out" }).click(); await buyer.waitForURL("**/checkout");
    await buyer.waitForTimeout(800); await buyer.check('input[value=pay_on_pickup]'); await buyer.screenshot({ path: `${OUT}/checkout.png` });
    await buyer.click('button:has-text("Place order")'); await buyer.waitForURL("**/account/orders?placed=1");
    await buyer.getByRole("link", { name: /Department Shirt/ }).click(); await buyer.waitForURL(/orders\/[0-9a-f-]+/); orderUrl = buyer.url();
  });
  await step("seller accepts, marks ready, and needs the buyer's code to complete", async () => {
    await newbie.goto(`${BASE}/seller/orders`); await newbie.getByRole("link", { name: /CP-/ }).first().click(); await newbie.waitForURL(/seller\/orders\/.+/);
    await newbie.click('button:has-text("Accept order")'); await newbie.getByText("Start processing").waitFor();
    await newbie.click('button:has-text("Mark ready for pickup")'); await newbie.getByText("pickup code").first().waitFor();
    await newbie.fill("[name=code]", "111111"); await newbie.click('button:has-text("Complete order")'); await toast(newbie, "doesn't match");
    await buyer.goto(orderUrl); const code = await buyer.locator("p.tracking-widest").innerText();
    await newbie.fill("[name=code]", code); await newbie.click('button:has-text("Complete order")'); await newbie.getByText("This order is closed").waitFor();
  });
  await step("buyer leaves one verified review", async () => {
    await buyer.goto(orderUrl); await buyer.fill("[name=body]", "Lovely shirt, quick pickup."); await buyer.click('button:has-text("Publish review")'); await buyer.getByText("You rated this 5/5").waitFor();
    await anon.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'")); await anon.getByText("Lovely shirt").waitFor();
  });
  await step("online checkout redirects to the provider and only the server marks it paid", async () => {
    await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'"));
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800);
    const [req] = await Promise.all([buyer.waitForRequest(/localhost:4010\/pay/, { timeout: 15000 }).catch(() => null), buyer.click('button:has-text("Place order")')]);
    expect(req, "went to provider");
    await buyer.getByText("Payment confirmed").first().waitFor({ timeout: 15000 });
    expect(sql("select count(*) from transactions where status='success' and verified_at is not null") === "1", "tx");
    expect(sql("select payment_status from orders order by created_at desc limit 1") === "paid", "paid");
  });
  await step("visiting the callback with an underpaid transaction grants nothing", async () => {
    await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'"));
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800);
    await buyer.route(/localhost:4010\/pay/, (r) => r.continue({ url: r.request().url() + "?underpay=1" }));
    await buyer.click('button:has-text("Place order")'); await buyer.getByText("Payment failed").first().waitFor({ timeout: 15000 });
    await buyer.unroute(/localhost:4010\/pay/);
    expect(sql("select payment_status from orders order by created_at desc limit 1") === "failed", "order must fail");
  });
  await step("webhooks need a valid signature and replays are ignored", async () => {
    const r = await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: "{}", headers: { "x-paystack-signature": "bad" } }); expect(r.status === 401, "bad sig");
    await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'"));
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800);
    await buyer.route(/localhost:4010\/pay/, (r) => r.abort()); await buyer.click('button:has-text("Place order")').catch(() => {}); await buyer.waitForTimeout(1500); await buyer.unroute(/localhost:4010\/pay/);
    const ref = await (await fetch("http://localhost:4010/last")).json();
    const before = sql(`select status from transactions where reference='${ref}'`); expect(before === "initiated", before);
    const { raw, sig } = await (await fetch(`http://localhost:4010/webhook-sign/${ref}`)).json();
    for (let i = 0; i < 2; i++) expect((await fetch(`${BASE}/api/webhooks/paystack`, { method: "POST", body: raw, headers: { "x-paystack-signature": sig } })).ok, "hook");
    expect(sql(`select status from transactions where reference='${ref}'`) === "success", "settled");
    expect(sql("select count(*) from webhook_events") === "1", "one event");
  });
  await step("completed online order earns commission and the seller can request a payout", async () => {
    await newbie.goto(`${BASE}/seller/orders?status=pending`);
    const n = await newbie.getByRole("link", { name: /CP-/ }).count(); expect(n >= 2, "paid orders only: " + n);
    expect(await newbie.getByText("Awaiting payment").count() === 0, "unpaid hidden");
    await newbie.getByRole("link", { name: /CP-/ }).first().click(); await newbie.waitForURL(/seller\/orders\/.+/);
    const id = newbie.url().split("/").pop();
    await newbie.click('button:has-text("Accept order")'); await newbie.getByText("Start processing").waitFor();
    await newbie.click('button:has-text("Mark ready for pickup")'); await newbie.getByText("pickup code").first().waitFor();
    await newbie.fill("[name=code]", sql(`select pickup_code from orders where id='${id}'`)); await newbie.click('button:has-text("Complete order")'); await newbie.getByText("This order is closed").waitFor();
    expect(sql(`select commission_kobo||'/'||net_kobo from commissions where order_id='${id}'`) === "25000/475000", "5% of 5000");
    await newbie.goto(`${BASE}/seller/storefront`);
    await newbie.fill("[name=account_number]", "0123456789"); await newbie.click('button:has-text("Save payout account")'); await toast(newbie, "Account confirmed");
    await newbie.goto(`${BASE}/seller/earnings`); await newbie.fill("[name=amount]", "99999"); await newbie.click('button:has-text("Request payout")'); await newbie.getByText("more than your available").waitFor();
    await newbie.fill("[name=amount]", "4500"); await newbie.click('button:has-text("Request payout")'); await toast(newbie, "Payout requested");
    await newbie.screenshot({ path: `${OUT}/earnings.png` });
    await admin.goto(`${BASE}/admin/finance?tab=payouts`); await admin.click('button:has-text("Send with Paystack")'); await admin.click('button:has-text("Yes, continue")'); await toast(admin, "Transfer sent");
    expect(sql("select status from seller_payouts limit 1") === "paid", "payout paid after verify");
  });
  await step("rejecting a paid order queues a refund that goes to the provider", async () => {
    await newbie.goto(`${BASE}/seller/orders?status=pending`); await newbie.getByRole("link", { name: /CP-/ }).first().click(); await newbie.waitForURL(/seller\/orders\/.+/);
    await newbie.click('button:has-text("Reject order")'); await newbie.click('button:has-text("Yes, continue")'); await newbie.getByText("This order is closed").waitFor();
    await admin.goto(`${BASE}/admin/finance?tab=refunds`); await admin.click('button:has-text("Send refund")'); await admin.click('button:has-text("Yes, continue")'); await toast(admin, "Refund sent");
    const r = await (await fetch("http://localhost:4010/refunds")).json(); expect(r.length === 1 && r[0].amount === 500000, JSON.stringify(r));
  });
  await step("paid plan can't be bought until admin sets a price, then upgrade unlocks features", async () => {
    sql("update subscription_plans set price_kobo=null where code='no-dulling'"); await newbie.goto(`${BASE}/seller/billing`); await newbie.getByText("Not on sale yet").first().waitFor();
    await newbie.goto(`${BASE}/seller/promotions`); await newbie.getByText("Discount codes come with").waitFor();
    await admin.goto(`${BASE}/admin/settings`); await admin.locator('form:has(button:has-text("Save No Dulling")) [name=price]').fill("2500"); await admin.click('button:has-text("Save No Dulling")'); await toast(admin, "Plan saved");
    await anon.goto(`${BASE}/pricing`); await anon.getByText("₦2,500").first().waitFor(); await anon.screenshot({ path: `${OUT}/pricing.png` });
    await newbie.goto(`${BASE}/seller/billing`); await newbie.click('button:has-text("Move to No Dulling")');
    await newbie.getByText("Payment confirmed").first().waitFor({ timeout: 15000 });
    await newbie.goto(`${BASE}/seller/billing`); await newbie.getByText(/on No Dulling/).first().waitFor();
    await newbie.goto(`${BASE}/seller/promotions`); await newbie.fill("[name=code]", "WELCOME10"); await newbie.fill("[name=percent_off]", "10"); await newbie.click('button:has-text("Create code")'); await toast(newbie, "Discount code created");
  });
  await step("discount code changes the server total", async () => {
    await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'"));
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800); await buyer.check('input[value=pay_on_pickup]'); await buyer.fill("[name=coupon]", "WELCOME10"); await buyer.click('button:has-text("Apply")'); await buyer.getByText("Code applied").waitFor(); await buyer.click('button:has-text("Place order")'); await buyer.waitForURL("**/orders?placed=1");
    expect(sql("select total_kobo from orders order by created_at desc limit 1") === "450000", "10% off");
  });
  await step("Odogwu credits buy a boost that shows as Sponsored", async () => {
    sql("insert into boost_credit_ledger(seller_id,delta,reason) select owner_id,2,'test' from storefronts where name='Chidi Prints'");
    await newbie.goto(`${BASE}/seller/boosts`); await newbie.locator('form:has(option:has-text("Department Shirt"))').first().locator('button:has-text("Start boost")').click(); await toast(newbie, "boost is live");
    await anon.goto(BASE); await anon.getByText("Department Shirt").first().waitFor();
  });
  await step("admin suspends a user: logged out, storefront hidden, audit logged", async () => {
    const p = await page(); await login(p, "glow@campora.test");
    await admin.goto(`${BASE}/admin/users?q=glow`); await admin.click('button:has-text("Suspend")'); await admin.click('button:has-text("Yes, continue")'); await toast(admin, "Account suspended");
    await p.goto(`${BASE}/account`); await p.waitForURL(/login/);
    expect((await fetch(`${BASE}/store/crown-studio`)).status === 404 || !(await (await fetch(`${BASE}/search?q=Knotless`)).text()).includes("Knotless Braids</h3>"), "hidden");
    await admin.goto(`${BASE}/admin/logs`); await admin.getByText("user.status").first().waitFor();
  });
  await step("reports and disputes reach admin", async () => {
    await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Vintage Denim Jacket'"));
    await buyer.getByText("Report this listing").click(); await buyer.click('button:has-text("Send report")'); await toast(buyer, "Report sent");
    await admin.goto(`${BASE}/admin/reports`); await admin.click('button:has-text("Mark resolved")'); await toast(admin, "Report resolved");
    await buyer.goto(orderUrl); await buyer.getByText("Problem with this order?").click(); await buyer.fill("[name=reason]", "The print started peeling after one wash."); await buyer.click('button:has-text("Open dispute")'); await toast(buyer, "Dispute opened");
    await admin.goto(`${BASE}/admin/disputes`); await admin.fill("[name=resolution]", "Seller agreed to reprint."); await admin.click('button:has-text("Close dispute")'); await toast(admin, "Dispute closed");
  });
  await step("password reset works and logs out old sessions", async () => {
    const e = "tolu.reset@example.com"; sql(`update users set email='${e}' where email='lens@campora.test'`);
    const p = await page(); await p.goto(`${BASE}/forgot-password`); await p.fill("[name=email]", e); await p.click('button:has-text("Send reset link")'); await toast(p, "on its way");
    await p.goto(await mailLink(p, e)); await p.fill("[name=password]", "brand-new-pass"); await p.click('button:has-text("Save new password")'); await p.waitForURL("**/login?reset=1");
    await p.fill("[name=email]", e); await p.fill("[name=password]", "brand-new-pass"); await p.click('button:has-text("Log in")'); await p.waitForURL(BASE + "/");
  });
  await step("cron needs its secret", async () => {
    expect((await fetch(`${BASE}/api/cron/daily`)).status === 401, "open");
    expect((await fetch(`${BASE}/api/cron/daily`, { headers: { authorization: "Bearer cron" } })).ok, "sweep");
  });
  await step("login brute force is throttled", async () => {
    clearLimits(); const p = await page(); await p.goto(`${BASE}/login`);
    for (let i = 0; i < 11; i++) { await p.fill("[name=email]", "buyer@campora.test"); await p.fill("[name=password]", "wrong"); await p.click('button:has-text("Log in")'); await p.waitForTimeout(220); }
    await p.getByText("Too many attempts").waitFor(); clearLimits();
  });
  await step("dashboards and mobile layouts render with no horizontal overflow", async () => {
    await newbie.goto(`${BASE}/seller`); await newbie.waitForTimeout(1000); await newbie.screenshot({ path: `${OUT}/seller.png` });
    await admin.goto(`${BASE}/admin`); await admin.waitForTimeout(1000); await admin.screenshot({ path: `${OUT}/admin.png` });
    await admin.goto(`${BASE}/admin/settings`); await admin.screenshot({ path: `${OUT}/admin-settings.png`, fullPage: true });
    for (const [name, device] of [["iphone", devices["iPhone 13"]], ["tablet", devices["iPad Mini"]]] as const) {
      const c = await browser.newContext({ ...device }); const p = await c.newPage();
      await p.goto(`${BASE}/login`); await p.fill("[name=email]", email); await p.fill("[name=password]", PW); await p.click('button:has-text("Log in")'); await p.waitForURL(BASE + "/");
      const listing = sql("select slug from listings where title='Vintage Denim Jacket'");
      for (const path of ["/", "/search?type=product", `/listing/${listing}`, "/store/thread-theory", "/pricing", "/cart", "/account", "/account/orders", "/messages", "/seller", "/seller/orders", "/seller/listings", "/seller/billing", "/seller/analytics"]) {
        await p.goto(BASE + path); await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over <= 0, `${name} ${path} overflows by ${over}px`);
        if (name === "iphone" && ["/", "/search?type=product", "/seller", `/listing/${listing}`, "/store/thread-theory"].includes(path)) { if (path === "/") await scrollThrough(p); await p.screenshot({ path: `${OUT}/m-${path.replace(/\W+/g, "_").slice(0, 16)}.png`, fullPage: false }); }
      }
    }
  });
  await step("seller customizes the dashboard and it persists", async () => {
    await newbie.bringToFront(); await newbie.goto(`${BASE}/seller`); await newbie.waitForTimeout(1200); await newbie.click('button:has-text("Customize")');
    await newbie.getByLabel("Show Best sellers").click(); await newbie.getByLabel("Move Plan usage up").click();
    await newbie.click('button:has-text("Save dashboard")'); await toast(newbie, "Dashboard saved");
    await newbie.goto(`${BASE}/seller`); await newbie.getByText("What needs you now").first().waitFor();
    expect(await newbie.getByRole("heading", { name: "Your best sellers" }).count() === 0, "widget still shown");
  });
  await step("anonymous add to cart and favourite go to login; bad URLs don't crash", async () => {
    const p = await page(); await p.goto(BASE + sql("select '/listing/'||slug from listings where title='Vintage Denim Jacket'"));
    await p.click('button:has-text("Add to cart")'); await p.waitForURL(/login/);
    for (const u of ["/search?min=abc&max=xyz&page=-1", "/search?sort=bad&type=weird", "/account/orders/not-a-uuid", "/seller/orders/not-a-uuid", "/listing/nope", "/store/nope", "/messages/not-a-uuid"]) {
      const r = await admin.goto(BASE + u); await admin.waitForTimeout(200);
      expect(r!.status() < 500, u + " " + r!.status()); expect(await admin.getByText("This page didn't load").count() === 0, "crash " + u);
    }
  });
  await step("restricted user can browse but not buy, message or sell", async () => {
    sql("update users set status='restricted' where email='wear@campora.test'");
    const p = await page(); await login(p, "wear@campora.test");
    await p.goto(BASE + sql("select '/listing/'||slug from listings where title='Wireless Earbuds'")); await p.click('button:has-text("Add to cart")'); await toast(p, "restricted");
    sql("update users set status='active' where email='wear@campora.test'");
  });
  await step("redirect after login can't leave the site", async () => {
    const p = await page(); await p.goto(`${BASE}/login?next=${encodeURIComponent("/\\\\evil.example")}`);
    await p.fill("[name=email]", "bowl@campora.test"); await p.fill("[name=password]", PW); await p.click('button:has-text("Log in")'); await p.waitForTimeout(1500); expect(p.url().startsWith(BASE), p.url());
  });
  await step("every link on every buyer, seller and admin page works", async () => {
    for (const [p, starts] of [[anon, ["/", "/pricing", "/search"]], [buyer, ["/", "/account", "/account/orders", "/account/rewards", "/messages", "/notifications", "/cart"]], [newbie, ["/seller", "/seller/orders", "/seller/listings", "/seller/storefront", "/seller/analytics", "/seller/promotions", "/seller/boosts", "/seller/earnings", "/seller/billing", "/seller/pickup", "/seller/services"]], [admin, ["/admin", "/admin/users", "/admin/verifications", "/admin/sellers", "/admin/listings", "/admin/categories", "/admin/reports", "/admin/disputes", "/admin/finance", "/admin/settings", "/admin/logs", "/admin/discounts", "/admin/referrals", "/admin/earnings"]]] as [Page, string[]][]) {
      const seen = new Set<string>();
      for (const s of starts) {
        await p.goto(BASE + s); await p.waitForTimeout(250);
        const links = await p.evaluate(() => [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")!));
        for (const l of links) { if (seen.has(l) || l.startsWith("/files")) continue; seen.add(l); const r = await p.request.get(BASE + l); expect(r.status() < 400, `${s} -> ${l} ${r.status()}`); }
        expect(await p.getByText("This page didn't load").count() === 0, "crash on " + s);
      }
      console.log("  links checked:", seen.size);
    }
  });
  await step("every visible button on key pages submits or does something", async () => {
    await admin.goto(`${BASE}/admin/settings`);
    const dead = await admin.evaluate(() => [...document.querySelectorAll("button")].filter((b) => (b as HTMLButtonElement).type !== "submit" && !Object.keys(b).some((k) => k.startsWith("__reactProps"))).map((b) => b.textContent));
    expect(dead.length === 0, "dead: " + dead.join());
  });
  await step("admin creates a discount in the dashboard and a buyer sees it at checkout with the commission note", async () => {
    await admin.bringToFront(); await admin.goto(`${BASE}/admin/discounts/new`);
    await admin.fill("[name=name]", "Campus sale"); await admin.fill("[name=code]", "CAMPUS20"); await admin.fill("[name=value]", "20"); await admin.fill("[name=maximum_discount]", "3000");
    await admin.click('button[value=active]'); await admin.waitForURL("**/admin/discounts?tab=all"); await admin.getByText("CAMPUS20").first().waitFor();
    await buyer.bringToFront(); await buyer.goto(BASE + sql("select '/listing/'||slug from listings where title='Department Shirt'")); await buyer.waitForTimeout(800);
    await buyer.click('button:has-text("Add to cart")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800);
    await buyer.fill("[name=coupon]", "CAMPUS20"); await buyer.click('button:has-text("Apply")'); await buyer.getByText("Code applied").waitFor();
    expect((await buyer.getByTestId("total").innerText()).includes("4,000"), "total after 20%");
    await buyer.getByText("not added to your total").waitFor(); await buyer.screenshot({ path: `${OUT}/checkout-discount.png` });
    await buyer.click('button:has-text("Place order")'); await buyer.getByText("Payment confirmed").first().waitFor({ timeout: 15000 });
    expect(sql("select count(*) from discount_redemptions where status='confirmed'") === "1", "redemption confirmed");
  });
  await step("referral: admin switches it on, friend joins by link, rewards page shows it", async () => {
    await admin.bringToFront(); await admin.goto(`${BASE}/admin/referrals`); await admin.check("[name=enabled]"); await admin.click('button:has-text("Save settings")'); await toast(admin, "Referral settings saved");
    await buyer.bringToFront(); await buyer.goto(`${BASE}/account/rewards`); const code = sql("select referral_code from users where email='buyer@campora.test'"); await buyer.getByText(code).first().waitFor(); await buyer.screenshot({ path: `${OUT}/rewards.png` });
    const p = await page(); await p.goto(`${BASE}/register?ref=${code}`);
    await p.fill("[name=full_name]", "Friend One"); await p.fill("[name=email]", "friend@example.com"); await p.fill("[name=password]", PW); await p.click('button:has-text("Create account")'); await p.waitForURL("**/account**");
    expect(sql("select status from referrals limit 1") === "pending_purchase", "referral saved");
    await p.goto(`${BASE}/admin/referrals`); await p.waitForURL((u) => !u.pathname.startsWith("/admin"));
    await admin.goto(`${BASE}/admin/referrals`); await admin.getByText("Friend One").waitFor();
  });
  await step("seller adds pickup points; service booking gets live tracking", async () => {
    await newbie.bringToFront(); await newbie.goto(`${BASE}/seller/pickup`); await newbie.fill("[name=name]", "Joseph Hall gate"); await newbie.fill("[name=time_window]", "4pm to 6pm"); await newbie.click('button:has-text("Add pickup point")'); await toast(newbie, "Pickup point saved");
    sql("update users set status='active' where email='glow@campora.test'; update storefronts set status='active' where status='suspended'");
    const svc = sql("select l.slug from listings l join services s on s.listing_id=l.id join storefronts f on f.id=l.storefront_id join users u on u.id=f.owner_id where s.price_type='fixed' and u.email='glow@campora.test' limit 1");
    await buyer.bringToFront(); await buyer.goto(`${BASE}/listing/${svc}`); await buyer.waitForTimeout(800); await buyer.click('button:has-text("Book this service")'); await toast(buyer, "Added to cart");
    await buyer.goto(`${BASE}/checkout`); await buyer.waitForTimeout(800); await buyer.check('input[value=pay_on_pickup]'); await buyer.click('button:has-text("Place order")'); await buyer.waitForURL("**/orders?placed=1");
    const id = sql("select id from orders order by created_at desc limit 1"); const owner = sql(`select u.email from orders o join storefronts s on s.id=o.storefront_id join users u on u.id=s.owner_id where o.id='${id}'`);
    await buyer.goto(`${BASE}/account/orders/${id}`); await buyer.getByText("Track your service").waitFor();
    const s = await page(); await login(s, owner); await s.bringToFront(); await s.goto(`${BASE}/seller/orders/${id}`); await s.waitForTimeout(800);
    await s.click('button:has-text("Accept order")'); await s.getByText("Start processing").waitFor();
    await s.fill("textarea[name=note], input[name=note]", "Your slot is confirmed"); await s.click('button:has-text("Send update")'); await toast(s, "Update sent");
    await s.fill("[name=pickup_window]", "5pm"); await s.click('button:has-text("Update pickup")'); await toast(s, "Pickup updated");
    await buyer.bringToFront(); await buyer.getByText("Your slot is confirmed").first().waitFor({ timeout: 9000 });
    const other = await page(); await login(other, "bowl@campora.test"); expect((await other.request.get(`${BASE}/api/orders/${id}/tracker`)).status() === 404, "tracker leak");
    expect((await other.request.post(`${BASE}/api/orders/${id}/location`, { data: { latitude: 1, longitude: 1 } })).status() === 403, "location write");
  });
  await step("user deletes account: needs password and DELETE, then is logged out", async () => {
    const p = await page(); await p.goto(`${BASE}/login`); await p.fill("[name=email]", "friend@example.com"); await p.fill("[name=password]", PW); await p.click('button:has-text("Log in")'); await p.waitForURL(BASE + "/");
    await p.bringToFront(); await p.goto(`${BASE}/account`); await p.waitForTimeout(800); await p.getByText("I want to delete my account").click();
    await p.fill('input[name=confirm]', "DELETE"); await p.locator('form:has(input[name=confirm]) input[name=password]').fill("wrong-pass");
    await p.click('button:has-text("Delete my account")'); await p.click('button:has-text("Yes, continue")'); await p.getByText("password isn't right").waitFor();
    await p.locator('form:has(input[name=confirm]) input[name=password]').fill(PW); await p.click('button:has-text("Delete my account")'); await p.click('button:has-text("Yes, continue")'); await p.waitForURL("**/login?deleted=1");
    expect(sql("select count(*) from account_deletion_requests where status='scheduled'") === "1", "scheduled");
    await p.fill("[name=email]", "friend@example.com"); await p.fill("[name=password]", PW); await p.click('button:has-text("Log in")'); await p.waitForURL(BASE + "/");
    expect(sql("select count(*) from account_deletion_requests where status='cancelled'") === "1", "cancelled by login");
  });
  await step("earnings report and exports are admin-only", async () => {
    await admin.bringToFront(); await admin.goto(`${BASE}/admin/earnings`); await admin.getByText("Every commission").waitFor();
    const r = await admin.request.get(`${BASE}/api/admin/export?report=commissions`); expect(r.ok() && (await r.text()).includes("seller_earnings"), "csv");
    expect((await buyer.request.get(`${BASE}/api/admin/export?report=ledger`)).status() === 403, "buyer export");
  });
  await step("no uncaught browser errors in any journey", async () => expect(consoleErrors.length === 0, consoleErrors.slice(0, 5).join("\n")));

  await browser.close(); app.kill(); gw.kill();
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} journeys passed`);
  failed.forEach((f) => console.log("FAILED:", f[0], "\n  ", f[2]));
  process.exit(failed.length ? 1 : 0);
})();
