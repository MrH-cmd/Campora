import "dotenv/config";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Client } from "pg";
import { hashPassword } from "../src/lib/auth-core";
import { EFFECTS, TEMPLATES } from "../src/lib/storefront-catalog";

// Sample data for development. Every sample row has is_sample = true, and sample art is generated here.
const require = createRequire(import.meta.url);
const iconDir = join(dirname(require.resolve("lucide-static/package.json")), "icons");
const rawIcon = (name: string) => readFileSync(join(iconDir, `${name}.svg`), "utf8").replace(/<!--[\s\S]*?-->/, "").replace(/^[\s\S]*?<svg[^>]*>/, "").replace("</svg>", "");

const palettes = [["#0f6b54", "#c9f2dc"], ["#1c2d52", "#ffd98a"], ["#b5472f", "#ffe3d3"], ["#3f2a7a", "#dcd2ff"], ["#0a5c7a", "#bfeaf5"], ["#7a5200", "#ffe9a8"]];
function art(icon: string, seed: number, w = 800, h = 1000) {
  const [bg, fg] = palettes[seed % palettes.length];
  const s = Math.min(w, h) * .5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${w * .82}" cy="${h * .16}" r="${s * .9}" fill="${fg}" opacity=".13"/><circle cx="${w * .12}" cy="${h * .92}" r="${s * .7}" fill="${fg}" opacity=".1"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 24})" fill="none" stroke="${fg}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${rawIcon(icon)}</g></svg>`;
}

const CATS: [string, string, "product" | "service", string][] = [
  ["fashion", "Fashion", "product", "Shirt"], ["sneakers", "Sneakers", "product", "Footprints"], ["food", "Food and snacks", "product", "UtensilsCrossed"],
  ["electronics", "Electronics", "product", "Laptop"], ["beauty", "Beauty", "product", "Sparkles"], ["books", "Books and supplies", "product", "BookOpen"],
  ["design", "Graphic design", "service", "PenTool"], ["photo", "Photography", "service", "Camera"], ["hair", "Hair and beauty", "service", "Scissors"], ["tech", "Tech and freelance", "service", "Code"],
];

const STORES = [
  { key: "kicks", name: "Sole Republic", owner: "Tobi Adeyemi", tagline: "Custom-painted sneakers, made in Hall D", loc: "Daniel Hall", icon: "footprints", items: [
    ["Hand-painted Canvas Lows", "sneakers", 3200000, null, 4, "handmade", "footprints", "Plain canvas lows painted by hand to your design. Send your idea and we'll sketch it first."],
    ["Cleaned Retro High-tops", "sneakers", 4500000, 3900000, 2, "like_new", "footprints", "Deep-cleaned and re-laced retro high-tops, UK 42 to 44."],
    ["Sneaker Restoration", "SERVICE:design", 800000, null, 0, "from", "paintbrush", "Deep clean, sole whitening and repaint for tired sneakers."],
  ]},
  { key: "bowl", name: "Mama T's Kitchen", owner: "Tolu Bassey", tagline: "Hot jollof before your 2pm", loc: "Dorcas Hall", icon: "soup", items: [
    ["Smoky Jollof and Chicken", "food", 250000, null, 30, "new", "soup", "Party-style jollof with grilled chicken and plantain. Orders close at 11am."],
    ["Small Chops Box", "food", 350000, 300000, 20, "new", "cookie", "Puff-puff, samosa and spring rolls for you and your roommates."],
    ["Zobo Pack of Six", "food", 180000, null, 15, "new", "cup-soda", "Chilled homemade zobo with ginger and pineapple."],
  ]},
  { key: "lens", name: "Frame by Kene", owner: "Kene Okafor", tagline: "Convocation and birthday shoots on campus", loc: "Chapel area", icon: "camera", items: [
    ["Final-year Photoshoot", "SERVICE:photo", 2500000, null, 0, "fixed", "camera", "One-hour shoot with twelve edited photos, delivered in three days."],
    ["Event Coverage", "SERVICE:photo", 6000000, null, 0, "from", "aperture", "Departmental dinners and birthdays. Price depends on hours."],
  ]},
  { key: "wear", name: "Thread Theory", owner: "Ada Nwosu", tagline: "Thrift picks and Sunday fits", loc: "Esther Hall", icon: "shirt", items: [
    ["Linen Two-piece Set", "fashion", 1800000, null, 5, "new", "shirt", "Breathable linen set in sage and cream. Sizes S to XL."],
    ["Vintage Denim Jacket", "fashion", 1500000, 1200000, 3, "used", "scissors", "Hand-picked thrift denim, washed and pressed."],
    ["Canvas Tote Bag", "fashion", 450000, null, 12, "new", "shopping-bag", "Sturdy tote that fits a laptop and two textbooks."],
  ]},
  { key: "tech", name: "Hostel Gadgets", owner: "Seyi Martins", tagline: "Tested second-hand electronics", loc: "Peter Hall", icon: "laptop", items: [
    ["Refurbished Laptop 14 inch", "electronics", 18500000, null, 2, "used", "laptop", "8GB RAM, 256GB SSD. Tested, with a two-week swap promise from the seller."],
    ["Wireless Earbuds", "electronics", 950000, null, 8, "new", "headphones", "Sealed earbuds with charging case."],
    ["Laptop Repair", "SERVICE:tech", 500000, null, 0, "from", "wrench", "Screen, keyboard and battery swaps. Diagnosis is free."],
  ]},
  { key: "glow", name: "Crown Studio", owner: "Ife Danjuma", tagline: "Braids and nails in Mary Hall", loc: "Mary Hall", icon: "scissors", items: [
    ["Knotless Braids", "SERVICE:hair", 1200000, null, 0, "fixed", "scissors", "Medium knotless braids, hair included. Evenings and Saturdays."],
    ["Logo and Flyer Pack", "SERVICE:design", 700000, null, 0, "fixed", "pen-tool", "A clean logo and two flyers for your small business."],
    ["Shea Body Butter", "beauty", 300000, null, 25, "handmade", "sparkles", "Whipped shea butter scented with orange peel."],
  ]},
];

const PICKUP_POINTS = ["University Chapel car park", "Centre for Learning Resources entrance", "Cafeteria 1", "Cafeteria 2",
  "College of Science and Technology", "College of Engineering", "College of Management and Social Sciences", "College of Leadership Development Studies",
  "University Stadium", "Daniel Hall gate", "Joseph Hall gate", "Paul Hall gate", "Peter Hall gate", "John Hall gate",
  "Esther Hall gate", "Mary Hall gate", "Deborah Hall gate", "Lydia Hall gate", "Dorcas Hall gate"];

const withSamples = process.argv.includes("--sample");

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const one = async (t: string, p?: unknown[]) => (await db.query(t, p as any[])).rows[0];
  // ADMIN_EMAIL promotes an already-registered account, because nothing else can create the first admin.
  if (process.env.ADMIN_EMAIL) await db.query("update users set role='admin' where lower(email)=lower($1)", [process.env.ADMIN_EMAIL]);
  const already = await db.query("select 1 from universities limit 1");
  // The template and effect catalogue is topped up on every deploy. Existing rows are left alone, so admin edits survive.
  for (const t of TEMPLATES) await db.query(
    `insert into storefront_templates(slug,name,description,category,industry_tags,style_tags,archetype,config,min_plan_code,sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (slug) do nothing`,
    [t.slug, t.name, t.description, t.category, t.industry_tags, t.style_tags, t.archetype, JSON.stringify(t.config), t.min_plan_code, t.sort]);
  for (const e of EFFECTS) await db.query(
    `insert into animation_assets(slug,name,description,category,renderer,min_plan_code,params_schema,sort)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (slug) do nothing`,
    [e.slug, e.name, e.description, e.category, e.renderer, e.min_plan_code, JSON.stringify(e.params_schema), e.sort]);
  if (already.rowCount) { console.log("Seed skipped: data already exists. Storefront catalogue checked."); await db.end(); return; }
  await db.query("begin");

  const cu = await one(
    `insert into universities(name,short_name,slug,city,state,verification_methods,student_email_domains,pickup_points)
     values ('Covenant University','CU','covenant-university','Ota','Ogun','{student_email,id_upload}','{stu.cu.edu.ng}',
       $1) returning id`, [PICKUP_POINTS]);

  const cats: Record<string, string> = {};
  for (const [i, [slug, name, kind, icon]] of CATS.entries())
    cats[slug] = (await one("insert into categories(slug,name,kind,icon,sort) values ($1,$2,$3,$4,$5) returning id", [slug, name, kind, icon, i])).id;

  const plans = [
    ["k-leg", "K-Leg", "For testing the market", 0, 5, 4, 0, 0, false, false, 0, ["One storefront", "Five active products or services", "Four photos per listing", "Basic enquiries and orders", "Basic promotions, ratings and statistics"]],
    ["no-dulling", "No Dulling", "For businesses gaining pace", 1500000, 20, 8, 1, 1, true, false, 0, ["One storefront", "20 active listings", "Eight photos per listing", "Advanced storefront customization", "Detailed analytics", "Advanced discounts and promotions"]],
    ["odogwu", "Odogwu", "For the biggest shops on campus", 3000000, 100, 12, 2, 2, true, true, 3, ["One storefront", "Up to 100 active listings", "Twelve photos per listing", "Full storefront customization", "Advanced analytics", "Marketing campaigns", "Monthly Store Boost credits"]],
  ] as const;
  let free = "";
  for (const [i, p] of plans.entries()) {
    const r = await one(
      `insert into subscription_plans(code,name,tagline,price_kobo,listing_limit,photo_limit,customization_level,analytics_level,coupons_enabled,campaigns_enabled,monthly_boost_credits,features,sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, [...p.slice(0, 11), p[11], i]);
    if (i === 0) free = r.id;
  }
  for (const [k, v] of [["commission_bps", 500], ["pay_on_pickup_enabled", true], ["require_listing_review", true], ["deletion_grace_days", 7], ["selling_requires_student", true]] as const)
    await db.query("insert into platform_settings(key,value) values ($1,$2) on conflict (key) do nothing", [k, JSON.stringify(v)]);
  const pk = async (name: string, place: string, days: number, credits: number) => (await one("insert into boost_packages(name,placement,duration_days,credit_cost) values ($1,$2,$3,$4) returning id", [name, place, days, credits])).id;
  const homePkg = await pk("Homepage spotlight", "homepage_featured", 7, 2);
  await pk("Top of search", "search_priority", 7, 1);
  await pk("Promoted storefront", "storefront_promoted", 7, 1);

  if (!withSamples) {
    await db.query("commit");
    await db.end();
    console.log("Seeded the university, categories, plans and settings.");
    return;
  }

  const pw = await hashPassword(process.env.SEED_PASSWORD ?? "campora-dev-1");
  const user = async (email: string, name: string, role: string, student = "verified") => (await one(
    `insert into users(email,password_hash,full_name,university_id,role,email_verified_at,student_status,is_sample) values ($1,$2,$3,$4,$5,now(),$6,true) returning id`,
    [email, pw, name, cu.id, role, student])).id;
  await user("admin@campora.test", "Campora Admin", "admin");
  const buyer = await user("buyer@campora.test", "Bisi Afolabi", "customer");

  const blob = (path: string, svg: string) => db.query("insert into file_blobs(path,content_type,data) values ($1,'image/svg+xml',$2)", [path, Buffer.from(svg)]);
  let n = 0; let firstListing = ""; let firstStore = "";
  for (const s of STORES) {
    const owner = await user(`${s.key}@campora.test`, s.owner, "seller");
    await db.query("insert into seller_profiles(user_id,status,business_name,business_type,pitch,reviewed_at) values ($1,'approved',$2,'Sample','Sample seller for development.',now())", [owner, s.name]);
    await db.query("insert into subscriptions(seller_id,plan_id) values ($1,$2)", [owner, free]);
    await blob(`sample/${s.key}-logo.svg`, art(s.icon, n, 400, 400));
    await blob(`sample/${s.key}-cover.svg`, art(s.icon, n + 1, 1600, 500));
    const store = (await one(
      `insert into storefronts(owner_id,university_id,slug,name,tagline,description,logo_path,cover_path,campus_location,contact_phone,is_sample)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'+234 800 000 0000',true) returning id`,
      [owner, cu.id, s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), s.name, s.tagline, `${s.name} is a sample storefront for development. ${s.tagline}.`, `sample/${s.key}-logo.svg`, `sample/${s.key}-cover.svg`, s.loc])).id;
    firstStore ||= store;
    for (const [title, cat, price, sale, stock, cond, icon, desc] of s.items as any[]) {
      n++;
      const service = cat.startsWith("SERVICE:");
      const l = await one(
        `insert into listings(storefront_id,category_id,kind,slug,title,description,price_kobo,sale_price_kobo,status,approved_at,sold_count,is_sample,created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',now(),$9,true, now() - make_interval(hours => $10)) returning id`,
        [store, cats[service ? cat.slice(8) : cat], service ? "service" : "product", `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title, desc, price, sale, (n * 7) % 23, n * 9]);
      firstListing ||= l.id;
      if (service) await db.query("insert into services(listing_id,price_type,availability,turnaround) values ($1,$2,'Evenings and weekends','2 to 3 days')", [l.id, cond === "from" ? "starting_from" : "fixed"]);
      else await db.query("insert into products(listing_id,stock,item_condition) values ($1,$2,$3)", [l.id, stock, cond]);
      for (let i = 0; i < 2; i++) {
        const path = `sample/l${n}-${i}.svg`;
        await blob(path, art(icon, n + i * 2));
        await db.query("insert into listing_images(listing_id,path,position) values ($1,$2,$3)", [l.id, path, i]);
      }
    }
  }
  await db.query(
    `insert into store_boosts(storefront_id,listing_id,package_id,placement,status,paid_with,starts_at,ends_at)
     select l.storefront_id, l.id, $1, 'homepage_featured','active','credits',now(),now()+interval '30 days' from listings l where l.is_sample and l.kind='product' order by l.price_kobo desc limit 5`, [homePkg]);
  await db.query("insert into promotional_campaigns(title,body,href,ends_at) values ('Food runs close at 11am','Order lunch early and collect from Cafeteria 1.','/search?category=food&type=product', now()+interval '60 days'), ('Final-year shoots are booking up','Find a campus photographer before convocation.','/search?category=photo&type=service', now()+interval '60 days')");
  await db.query("commit");
  await db.end();
  console.log(`Seeded ${n} sample listings across ${STORES.length} storefronts. Password for all sample accounts is SEED_PASSWORD or campora-dev-1.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
