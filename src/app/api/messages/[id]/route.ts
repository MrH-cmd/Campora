import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadThread } from "@/lib/messages";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const t = await asUser(u.id, async (db) => loadThread(db, (await params).id, u.id));
  return t ? Response.json({ messages: t.messages }) : new Response("Not found", { status: 404 });
}
