import { currentUser } from "@/lib/auth";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const f = await readFile(path);
  if (!f) return new Response("Not found", { status: 404 });
  if (f.is_private) {
    const u = await currentUser();
    if (!u || (u.role !== "admin" && u.id !== f.owner_id)) return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.content_type,
      "Cache-Control": f.is_private ? "private, no-store" : "public, max-age=604800, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
