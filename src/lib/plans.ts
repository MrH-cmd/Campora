import type { Db } from "./db";

type Row = { label: string; hint?: string; values: (string | number | boolean)[] };
/** Every plan's numbers and features in display order, read from the same tables the access checks use. */
export async function featureMatrix(db: Db) {
  const [plans, features, templates, effects] = await Promise.all([
    db.rows("select code, name, customization_level lvl, analytics_level, listing_limit, photo_limit, storefront_limit, effect_layers, coupons_enabled, monthly_boost_credits from subscription_plans order by sort"),
    db.rows("select key, label, description, grp, min_plan_code from plan_features order by sort"),
    db.rows("select min_plan_code, count(*)::int n from storefront_templates where is_active group by 1"),
    db.rows("select min_plan_code, count(*)::int n from animation_assets where is_active group by 1"),
  ]);
  const rank = Object.fromEntries(plans.map((p) => [p.code, p.lvl]));
  const upTo = (rows: { min_plan_code: string; n: number }[], lvl: number) => rows.filter((r) => (rank[r.min_plan_code] ?? 99) <= lvl).reduce((a, r) => a + r.n, 0);
  const days = (l: number) => [7, 30, 90][Math.max(0, Math.min(2, l))];
  const groups: { name: string; rows: Row[] }[] = [
    { name: "Storefronts", rows: [
      { label: "Storefronts", hint: "Separate stores, each with its own design, listings and orders", values: plans.map((p) => p.storefront_limit) },
      { label: "Storefront designs", values: plans.map((p) => upTo(templates, p.lvl)) },
      { label: "Effects and animations", values: plans.map((p) => upTo(effects, p.lvl)) },
      { label: "Effect layers per store", values: plans.map((p) => p.effect_layers) },
      { label: "Custom logo, colours, fonts and static banners", values: plans.map(() => true) },
      { label: "Social links, reviews and contact button", values: plans.map(() => true) },
    ] },
    { name: "Selling", rows: [
      { label: "Active listings (all stores together)", values: plans.map((p) => p.listing_limit) },
      { label: "Photos per listing", values: plans.map((p) => p.photo_limit) },
      { label: "Discount codes", values: plans.map((p) => !!p.coupons_enabled) },
      { label: "Store Boost credits each month", values: plans.map((p) => p.monthly_boost_credits || false) },
      { label: "Analytics history", values: plans.map((p) => `${days(p.analytics_level)} days`) },
    ] },
  ];
  for (const f of features) {
    let g = groups.find((x) => x.name === f.grp);
    if (!g) groups.push(g = { name: f.grp, rows: [] });
    g.rows.push({ label: f.label, hint: f.key === "gif_banner" ? f.description : undefined, values: plans.map((p) => (rank[f.min_plan_code] ?? 99) <= p.lvl) });
  }
  return { plans: plans.map((p) => ({ code: p.code as string, name: p.name as string })), groups };
}
