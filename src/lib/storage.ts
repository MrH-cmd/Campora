import { randomUUID } from "node:crypto";
import { ActionError } from "./auth";
import { asSystem } from "./db";

const MAX_BYTES = 5 * 1024 * 1024;
const SIGNATURES: [string, string, (b: Buffer) => boolean][] = [
  ["image/jpeg", "jpg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", "png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/webp", "webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
];

const supabase = () => process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, bucket: process.env.SUPABASE_BUCKET ?? "campora" }
  : null;

/** Stores an image after checking its real bytes. The browser's claimed type is ignored. */
export async function saveImage(file: File, folder: string, ownerId: string, isPrivate = false) {
  if (file.size > MAX_BYTES) throw new ActionError("Images must be 5 MB or smaller.");
  const data = Buffer.from(await file.arrayBuffer());
  const match = SIGNATURES.find(([, , test]) => test(data));
  if (!match) throw new ActionError("Upload a JPG, PNG or WebP image.");
  const [type, ext] = match;
  const path = `${isPrivate ? "private" : "public"}/${folder}/${randomUUID()}.${ext}`;
  const s = supabase();
  if (s) {
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${path}`, {
      method: "POST", body: data, headers: { Authorization: `Bearer ${s.key}`, "Content-Type": type },
    });
    if (!res.ok) throw new ActionError("The image could not be stored. Try again.");
    await asSystem((db) => db.run(
      "insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,$2,''::bytea,$3,$4)", [path, type, isPrivate, ownerId]));
  } else {
    await asSystem((db) => db.run(
      "insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,$2,$3,$4,$5)", [path, type, data, isPrivate, ownerId]));
  }
  return path;
}

/** Student documents: images or PDF, private, up to 5 MB. */
export async function saveDocument(file: File, ownerId: string) {
  const head = Buffer.from(await file.slice(0, 5).arrayBuffer());
  if (head.toString() !== "%PDF-") return saveImage(file, "student-ids", ownerId, true);
  if (file.size > MAX_BYTES) throw new ActionError("Documents must be 5 MB or smaller.");
  const data = Buffer.from(await file.arrayBuffer());
  const path = `private/student-ids/${randomUUID()}.pdf`;
  await asSystem((db) => db.run("insert into file_blobs(path, content_type, data, is_private, owner_id) values ($1,'application/pdf',$2,true,$3)", [path, data, ownerId]));
  return path;
}

export async function readFile(path: string) {
  const row = await asSystem((db) => db.one<{ content_type: string; data: Buffer; is_private: boolean; owner_id: string | null }>(
    "select content_type, data, is_private, owner_id from file_blobs where path = $1", [path]));
  if (!row) return null;
  const s = supabase();
  if (row.data.length === 0 && s) {
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${path}`, { headers: { Authorization: `Bearer ${s.key}` } });
    if (!res.ok) return null;
    return { ...row, data: Buffer.from(await res.arrayBuffer()) };
  }
  return row;
}
