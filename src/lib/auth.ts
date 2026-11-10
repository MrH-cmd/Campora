import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { hashToken, newToken } from "./auth-core";
import { asSystem, type Db } from "./db";

export { hashPassword, hashToken, newToken, verifyPassword } from "./auth-core";

const COOKIE = "campora_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string; email: string; full_name: string; phone: string | null; role: "customer" | "seller" | "admin";
  status: "active" | "restricted" | "suspended"; student_status: string; university_id: string | null;
  email_verified_at: string | null; avatar_path: string | null; university_name: string | null; university_slug: string | null;
};

export async function startSession(userId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await asSystem((db) => db.run("insert into sessions(user_id, token_hash, expires_at) values ($1,$2,$3)", [userId, hashToken(token), expires]));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https") ?? false, path: "/", expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await asSystem((db) => db.run("delete from sessions where token_hash = $1", [hashToken(token)]));
  jar.delete(COOKIE);
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return asSystem((db) => db.one<SessionUser>(
    `select u.id, u.email, u.full_name, u.phone, u.role, u.status, u.student_status, u.university_id,
            u.email_verified_at, u.avatar_path, un.name as university_name, un.slug as university_slug
     from sessions s join users u on u.id = s.user_id left join universities un on un.id = u.university_id
     where s.token_hash = $1 and s.expires_at > now() and u.status <> 'suspended'`, [hashToken(token)]));
});

export async function requireUser(next?: string) {
  const u = await currentUser();
  if (!u) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return u;
}

export async function requireSeller() {
  const u = await requireUser("/seller");
  // Admins can use every seller tool too, on the top plan (see effective_plan).
  if (u.role === "seller" || u.role === "admin") return u;
  redirect("/account/become-seller");
}

export async function requireAdmin() {
  const u = await requireUser("/admin");
  if (u.role !== "admin") forbidden();
  return u;
}

export class ActionError extends Error {}

/** Throttles by key using the database, so it holds across serverless instances. */
export async function rateLimit(key: string, max: number, windowSeconds: number, db?: Db) {
  const run = async (d: Db) => {
    const r = await d.one<{ hits: number }>(
      `insert into rate_limits(key, hits, reset_at) values ($1, 1, now() + make_interval(secs => $2))
       on conflict (key) do update set
         hits = case when rate_limits.reset_at < now() then 1 else rate_limits.hits + 1 end,
         reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
       returning hits`, [key, windowSeconds]);
    if (r!.hits > max) throw new ActionError("Too many attempts. Wait a few minutes and try again.");
  };
  return db ? run(db) : asSystem(run);
}
