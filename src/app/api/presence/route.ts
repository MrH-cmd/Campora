import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";

const body = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("Bad request", { status: 400 });
  const u = await currentUser();
  await asSystem((db) => db.run(
    `insert into presence(visitor_id,user_id) values ($1,$2)
     on conflict (visitor_id) do update set user_id=excluded.user_id, last_seen_at=now()`, [p.data.id, u?.id ?? null]));
  return new Response(null, { status: 204 });
}
