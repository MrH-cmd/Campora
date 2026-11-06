import { currentUser } from "@/lib/auth";
import { asSystem } from "@/lib/db";
import { liveCounts } from "@/lib/live";

export async function GET() {
  const u = await currentUser();
  if (u?.role !== "admin") return new Response("Forbidden", { status: 403 });
  return Response.json(await asSystem(liveCounts), { headers: { "Cache-Control": "no-store" } });
}
