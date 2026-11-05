import { notFound } from "next/navigation";
import { DiscountForm } from "@/components/discount-form";
import { Badge, Card, PageHead, statusTone, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { dateTime, naira } from "@/lib/format";

export const metadata = { title: "Edit discount" };
export default async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireAdmin();
  const d = await asUser(a.id, async (db) => {
    const c = await db.one("select * from discount_campaigns where id=$1", [id]).catch(() => null);
    return c ? { c, cats: await db.rows("select id,name from categories where is_active order by sort"),
      uses: await db.rows("select r.*, o.number, u.full_name from discount_redemptions r join orders o on o.id=r.order_id join users u on u.id=r.user_id where r.campaign_id=$1 order by r.redeemed_at desc limit 200", [id]) } : null;
  });
  if (!d) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHead title={d.c.name} />
      <Card><DiscountForm c={d.c} cats={d.cats} used={d.uses.length > 0} /></Card>
      {d.uses.length > 0 && <Table head={["Customer", "Order", "Amount", "Status", "When"]}>{d.uses.map((r) => <tr key={r.id}><Td>{r.full_name}</Td><Td>{r.number}</Td><Td>{naira(r.discount_kobo)}</Td><Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td><Td>{dateTime(r.redeemed_at)}</Td></tr>)}</Table>}
    </div>
  );
}
