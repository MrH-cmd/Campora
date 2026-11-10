import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { recordClick, recordVisit, sourceOf } from "@/lib/storefront-stats";

const body = z.object({
  storefront_id: z.string().uuid(), type: z.enum(["visit", "click"]),
  ref: z.string().max(253).regex(/^[a-z0-9.-]*$/i).optional(), device: z.enum(["mobile", "desktop"]).optional(),
});
const COOKIE = "vybe_vid";

/** Store analytics beacon. The visitor id lives in a first-party cookie and is only stored as a daily hash. */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("Bad request", { status: 400 });
  const jar = await cookies();
  let vid = jar.get(COOKIE)?.value;
  if (!vid || !/^[0-9a-f-]{36}$/.test(vid)) {
    vid = randomUUID();
    jar.set(COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  try { await rateLimit(`track:${vid}`, 300, 3600); } catch { return new Response(null, { status: 204 }); }
  const u = await currentUser();
  if (p.data.type === "visit") {
    const own = (() => { try { return new URL(process.env.APP_URL ?? "").hostname; } catch { return null; } })();
    await recordVisit(p.data.storefront_id, vid, u?.id ?? null, { source: sourceOf(p.data.ref, own), device: p.data.device ?? "desktop" });
  }
  else await recordClick(p.data.storefront_id, vid, u?.id ?? null);
  return new Response(null, { status: 204 });
}
