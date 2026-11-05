import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadTracker } from "@/lib/tracker";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const t = await asUser(u.id, async (db) => loadTracker(db, (await params).id));
  return t ? Response.json(t) : new Response("Not found", { status: 404 });
}
