import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";

async function seller(id: string) {
  const u = await currentUser();
  if (!u || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return asSystem((db) => db.one(
    `select o.id from orders o join storefronts s on s.id=o.storefront_id where o.id=$1 and s.owner_id=$2 and o.status not in ('completed','cancelled') and exists (select 1 from order_items i where i.order_id=o.id and i.kind='service')`, [id, u.id]));
}
const body = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await seller(id))) return new Response("Forbidden", { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("Bad request", { status: 400 });
  await asSystem((db) => db.run(
    `insert into service_locations(order_id,latitude,longitude) values ($1,$2,$3) on conflict (order_id) do update set latitude=$2, longitude=$3, is_sharing=true, updated_at=now()`, [id, p.data.latitude, p.data.longitude]));
  return new Response(null, { status: 204 });
}

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await seller(id))) return new Response("Forbidden", { status: 403 });
  await asSystem((db) => db.run("delete from service_locations where order_id=$1", [id]));
  return new Response(null, { status: 204 });
}
