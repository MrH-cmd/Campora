import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export async function GET() {
  const u = await currentUser();
  if (!u) return Response.json({ unread: 0 });
  const r = await asUser(u.id, (db) => db.one("select count(*)::int n from notifications where user_id=$1 and read_at is null", [u.id]));
  return Response.json({ unread: r.n });
}
