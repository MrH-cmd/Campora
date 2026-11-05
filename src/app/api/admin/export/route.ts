import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

const REPORTS: Record<string, string> = {
  commissions: `select o.number as order_number, s.name as seller, c.gross_kobo/100.0 as sale, c.eligible_kobo/100.0 as eligible_sale, c.rate_bps/100.0 as rate_percent, c.commission_kobo/100.0 as commission, c.net_kobo/100.0 as seller_earnings, c.status, c.created_at from commissions c join orders o on o.id=c.order_id join storefronts s on s.id=c.storefront_id order by c.created_at desc`,
  ledger: `select created_at, entry_type, reference, amount_kobo/100.0 as amount, memo from financial_ledger order by created_at desc`,
  discounts: `select c.name as discount, c.code, o.number as order_number, u.full_name as customer, r.discount_kobo/100.0 as discount_amount, r.platform_funded_kobo/100.0 as platform_funded, r.seller_funded_kobo/100.0 as seller_funded, r.status, r.redeemed_at from discount_redemptions r join discount_campaigns c on c.id=r.campaign_id join orders o on o.id=r.order_id join users u on u.id=r.user_id order by r.redeemed_at desc`,
};
const cell = (v: unknown) => { let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };

export async function GET(req: Request) {
  const u = await currentUser();
  if (u?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const name = new URL(req.url).searchParams.get("report") ?? "";
  const sql = REPORTS[name];
  if (!sql) return new Response("Not found", { status: 404 });
  const rows = await asUser(u.id, (db) => db.rows(sql));
  const head = rows[0] ? Object.keys(rows[0]) : [];
  const csv = [head.join(","), ...rows.map((r) => head.map((h) => cell(r[h])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="vybe-${name}.csv"`, "Cache-Control": "no-store" } });
}
