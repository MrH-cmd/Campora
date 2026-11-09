import { randomUUID } from "node:crypto";
import { ActionError } from "./auth";

export const MEDIA_LIMITS = { image: 5 * 1024 * 1024, gif: 8 * 1024 * 1024, video: 15 * 1024 * 1024, lottie: 1024 * 1024, videoMs: 20_000 };
const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

const cfg = () => process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? { url: process.env.SUPABASE_URL.replace(/\/$/, ""), key: process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.SUPABASE_MEDIA_BUCKET ?? "vybe-store-media" }
  : null;
/** GIF and video banners are only offered when Supabase Storage is set up. */
export const storageConfigured = () => !!cfg();

/** Stored paths starting with "sb/" live in the public media bucket; everything else is served by /files. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("sb/")) return `/files/${path}`;
  const s = cfg();
  return s ? `${s.url}/storage/v1/object/public/${s.bucket}/${path.slice(3)}` : null;
}

export type Inspected = { kind: "image" | "gif" | "video"; mime: string; ext: string; width?: number; height?: number; durationMs?: number };

function mp4(b: Buffer): Inspected | null {
  if (b.length < 16 || b.subarray(4, 8).toString("latin1") !== "ftyp") return null;
  let off = 0; let moov: Buffer | null = null;
  while (off + 8 <= b.length) {
    let size = b.readUInt32BE(off); const type = b.subarray(off + 4, off + 8).toString("latin1"); let head = 8;
    if (size === 1 && off + 16 <= b.length) { size = Number(b.readBigUInt64BE(off + 8)); head = 16; } else if (size === 0) size = b.length - off;
    if (size < head) break;
    if (type === "moov") { moov = b.subarray(off + head, Math.min(off + size, b.length)); break; }
    off += size;
  }
  if (!moov) return { kind: "video", mime: "video/mp4", ext: "mp4" };
  const out: Inspected = { kind: "video", mime: "video/mp4", ext: "mp4" };
  const mv = moov.indexOf("mvhd", 0, "latin1");
  if (mv >= 0) {
    const p = mv + 4; const v = moov[p];
    const [scale, dur] = v === 1 ? [moov.readUInt32BE(p + 20), Number(moov.readBigUInt64BE(p + 24))] : [moov.readUInt32BE(p + 12), moov.readUInt32BE(p + 16)];
    if (scale > 0) out.durationMs = Math.round(dur / scale * 1000);
  }
  for (let tk = moov.indexOf("tkhd", 0, "latin1"); tk >= 0; tk = moov.indexOf("tkhd", tk + 4, "latin1")) {
    const p = tk + 4; const end = p + (moov[p] === 1 ? 96 : 84);
    if (end > moov.length) break;
    const w = moov.readUInt32BE(end - 8) >>> 16, h = moov.readUInt32BE(end - 4) >>> 16;
    if (w && h) { out.width = w; out.height = h; break; }
  }
  return out;
}

function webm(b: Buffer): Inspected | null {
  if (b.length < 4 || b.readUInt32BE(0) !== 0x1a45dfa3) return null;
  const out: Inspected = { kind: "video", mime: "video/webm", ext: "webm" };
  const head = b.subarray(0, Math.min(b.length, 2_000_000));
  if (head.indexOf("webm", 0, "latin1") < 0) return null;
  let scale = 1_000_000;
  const ts = head.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
  if (ts >= 0) { const n = head[ts + 3] & 0x0f; if (n >= 1 && n <= 6 && ts + 4 + n <= head.length) scale = head.readUIntBE(ts + 4, n); }
  for (let i = head.indexOf(Buffer.from([0x44, 0x89])); i >= 0; i = head.indexOf(Buffer.from([0x44, 0x89]), i + 2)) {
    const len = head[i + 2];
    if (len === 0x88 && i + 11 <= head.length) { out.durationMs = Math.round(head.readDoubleBE(i + 3) * scale / 1e6); break; }
    if (len === 0x84 && i + 7 <= head.length) { out.durationMs = Math.round(head.readFloatBE(i + 3) * scale / 1e6); break; }
  }
  return out;
}

/** Works out what a file really is from its bytes. File names and browser-supplied types are ignored. */
export function inspectMedia(b: Buffer): Inspected | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png", ext: "png" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  const sig = b.subarray(0, 6).toString("latin1");
  if ((sig === "GIF87a" || sig === "GIF89a") && b.length >= 10) return { kind: "gif", mime: "image/gif", ext: "gif", width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  return mp4(b) ?? webm(b);
}

/** Applies the size and length limits to an inspected file. Throws a message the seller can act on. */
export function checkMedia(want: "gif" | "video", info: Inspected | null, bytes: number) {
  if (!info || info.kind !== want)
    throw new ActionError(want === "gif" ? "That file isn't a real GIF. Upload a .gif file." : "That file isn't a real MP4 or WebM video.");
  if (want === "gif" && bytes > MEDIA_LIMITS.gif) throw new ActionError(`GIFs must be ${MB(MEDIA_LIMITS.gif)} or smaller. Try a shorter or smaller GIF.`);
  if (want === "video") {
    if (bytes > MEDIA_LIMITS.video) throw new ActionError(`Videos must be ${MB(MEDIA_LIMITS.video)} or smaller. Export at 720p or trim it.`);
    if (info.durationMs == null) throw new ActionError("We couldn't read the video's length. Export it again as MP4 and retry.");
    if (info.durationMs > MEDIA_LIMITS.videoMs) throw new ActionError(`Banner videos can be at most ${MEDIA_LIMITS.videoMs / 1000} seconds. This one is ${Math.round(info.durationMs / 1000)} seconds.`);
  }
  return info;
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}`, apikey: key });
let bucketReady = false;
async function ensureBucket() {
  const s = cfg()!;
  if (bucketReady) return;
  const res = await fetch(`${s.url}/storage/v1/bucket`, {
    method: "POST", headers: { ...auth(s.key), "Content-Type": "application/json" },
    body: JSON.stringify({ id: s.bucket, name: s.bucket, public: true, file_size_limit: MEDIA_LIMITS.video, allowed_mime_types: ["image/gif", "video/mp4", "video/webm"] }),
  });
  if (!res.ok && res.status !== 409 && !(await res.text()).toLowerCase().includes("exist")) throw new ActionError("Media storage isn't reachable right now. Try again.");
  bucketReady = true;
}

/** A one-time URL the browser uploads to directly, which keeps big files away from the 4.5 MB request limit. */
export async function signedUpload(storefrontId: string, ext: "gif" | "mp4" | "webm") {
  const s = cfg();
  if (!s) throw new ActionError("GIF and video banners aren't switched on for this site yet.");
  await ensureBucket();
  const object = `${storefrontId}/${randomUUID()}.${ext}`;
  const res = await fetch(`${s.url}/storage/v1/object/upload/sign/${s.bucket}/${object}`, { method: "POST", headers: { ...auth(s.key), "Content-Type": "application/json" }, body: "{}" });
  const body = await res.json().catch(() => null) as { url?: string } | null;
  if (!res.ok || !body?.url) throw new ActionError("Couldn't start the upload. Try again.");
  return { path: `sb/${object}`, uploadUrl: `${s.url}/storage/v1${body.url}` };
}

export async function fetchStored(path: string): Promise<Buffer | null> {
  const s = cfg();
  if (!s || !path.startsWith("sb/")) return null;
  const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${path.slice(3)}`, { headers: auth(s.key) });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MEDIA_LIMITS.video + 1024) return Buffer.alloc(MEDIA_LIMITS.video + 2048);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteStored(path: string) {
  const s = cfg();
  if (!s || !path.startsWith("sb/")) return;
  await fetch(`${s.url}/storage/v1/object/${s.bucket}/${path.slice(3)}`, { method: "DELETE", headers: auth(s.key) }).catch(() => {});
}

/** A Lottie file must be plain animation data. Expressions (scripts inside the file) are refused. */
export function checkLottie(text: string) {
  if (Buffer.byteLength(text) > MEDIA_LIMITS.lottie) throw new ActionError("Lottie files must be 1 MB or smaller.");
  let j: any;
  try { j = JSON.parse(text); } catch { throw new ActionError("That isn't a Lottie JSON file."); }
  const ok = j && typeof j === "object" && typeof j.v === "string" && Array.isArray(j.layers) && [j.fr, j.ip, j.op, j.w, j.h].every((n) => typeof n === "number" && Number.isFinite(n));
  if (!ok) throw new ActionError("That isn't a Lottie JSON file.");
  if (j.fr <= 0 || j.fr > 120 || j.w > 4000 || j.h > 4000) throw new ActionError("That Lottie file has unusual settings and can't be used.");
  let scripted = false; let remote = false;
  (function walk(v: any, key: string, depth: number) {
    if (depth > 60 || scripted) return;
    if (typeof v === "string") {
      if (key === "x") scripted = true;
      if ((key === "u" || key === "p") && /^(https?:)?\/\//i.test(v)) remote = true;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key, depth + 1));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  })(j, "", 0);
  if (scripted) throw new ActionError("This Lottie file contains expressions (scripts). Export it without expressions.");
  if (remote) throw new ActionError("This Lottie file loads images from another site. Export it with images embedded or removed.");
  return { width: Math.round(j.w), height: Math.round(j.h), durationMs: Math.round((j.op - j.ip) / j.fr * 1000) };
}
