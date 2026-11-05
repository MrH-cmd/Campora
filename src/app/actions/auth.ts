"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action, id, optional, text } from "@/lib/action";
import { ActionError, endSession, hashPassword, hashToken, newToken, rateLimit, requireUser, startSession, verifyPassword } from "@/lib/auth";
import { asSystem, asUser, type Db } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { saveImage } from "@/lib/storage";

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(8, "Use at least 8 characters").max(128);

async function issueToken(db: Db, userId: string, kind: string, hours: number, meta: object = {}) {
  const token = newToken();
  await db.run("update auth_tokens set used_at=now() where user_id=$1 and kind=$2 and used_at is null", [userId, kind]);
  await db.run("insert into auth_tokens(user_id,kind,token_hash,meta,expires_at) values ($1,$2,$3,$4, now() + make_interval(hours => $5))",
    [userId, kind, hashToken(token), meta, hours]);
  return token;
}

async function consumeToken(db: Db, token: string, kind: string) {
  return db.one(
    "update auth_tokens set used_at=now() where token_hash=$1 and kind=$2 and used_at is null and expires_at>now() returning user_id, meta",
    [hashToken(token), kind]);
}

const safeNext = (n?: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export const register = action(z.object({
  full_name: text(2, 80, "Your name"), email, password, university_id: id, next: z.string().optional(),
}), async (d) => {
  await rateLimit(`register:${d.email}`, 5, 3600);
  const hash = await hashPassword(d.password);
  const created = await asSystem(async (db) => {
    const uni = await db.one("select id from universities where id=$1 and is_active", [d.university_id]);
    if (!uni) throw new ActionError("Choose a university from the list.");
    const u = await db.one(
      `insert into users(email,password_hash,full_name,university_id) values ($1,$2,$3,$4)
       on conflict (lower(email)) do nothing returning id`, [d.email, hash, d.full_name, d.university_id]);
    if (!u) throw new ActionError("An account with this email already exists. Log in instead.");
    return { id: u.id, token: await issueToken(db, u.id, "email_verify", 48) };
  });
  await sendEmail(d.email, "Verify your Campora email", `Hi ${d.full_name},\n\nConfirm your email: ${appUrl(`/verify-email?token=${created.token}`)}\n\nThis link lasts 48 hours.`);
  await startSession(created.id);
  redirect(safeNext(d.next) === "/" ? "/account?welcome=1" : safeNext(d.next));
});

export const login = action(z.object({ email, password: z.string().min(1, "Enter your password"), next: z.string().optional() }), async (d) => {
  await rateLimit(`login:${d.email}`, 10, 900);
  const u = await asSystem((db) => db.one("select id, password_hash, status from users where lower(email)=$1", [d.email]));
  // Same scrypt cost for unknown emails, so response time doesn't reveal who has an account.
  const ok = await verifyPassword(d.password, u?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!u || !ok) throw new ActionError("That email and password don't match.");
  if (u.status === "suspended") throw new ActionError("This account is suspended. Contact Campora support.");
  await startSession(u.id);
  redirect(safeNext(d.next));
});

export async function logout() {
  await endSession();
  redirect("/");
}

export const forgotPassword = action(z.object({ email }), async (d) => {
  await rateLimit(`forgot:${d.email}`, 3, 3600);
  const hit = await asSystem(async (db) => {
    const u = await db.one("select id from users where lower(email)=$1", [d.email]);
    return u ? await issueToken(db, u.id, "password_reset", 1) : null;
  });
  if (hit) await sendEmail(d.email, "Reset your Campora password", `Reset it here: ${appUrl(`/reset-password?token=${hit}`)}\n\nThis link lasts one hour. If you didn't ask for it, ignore this email.`);
  return "If that email has an account, a reset link is on its way.";
});

export const resetPassword = action(z.object({ token: z.string().min(10), password }), async (d) => {
  const hash = await hashPassword(d.password);
  await asSystem(async (db) => {
    const t = await consumeToken(db, d.token, "password_reset");
    if (!t) throw new ActionError("This reset link has expired. Request a new one.");
    await db.run("update users set password_hash=$2 where id=$1", [t.user_id, hash]);
    await db.run("delete from sessions where user_id=$1", [t.user_id]);
  });
  redirect("/login?reset=1");
});

export async function confirmEmail(token: string) {
  return asSystem(async (db) => {
    const t = await consumeToken(db, token, "email_verify");
    if (!t) return false;
    await db.run("update users set email_verified_at=now() where id=$1", [t.user_id]);
    return true;
  });
}

export async function confirmStudentEmail(token: string) {
  return asSystem(async (db) => {
    const t = await consumeToken(db, token, "student_email");
    if (!t) return false;
    await db.run("update student_verifications set status='approved', reviewed_at=now(), review_note='Confirmed by university email' where id=$1", [t.meta.verification_id]);
    await db.run("update users set student_status='verified' where id=$1", [t.user_id]);
    return true;
  });
}

export const resendVerification = action(z.object({}), async () => {
  const u = await requireUser();
  await rateLimit(`resend:${u.id}`, 3, 3600);
  const token = await asSystem((db) => issueToken(db, u.id, "email_verify", 48));
  await sendEmail(u.email, "Verify your Campora email", `Confirm your email: ${appUrl(`/verify-email?token=${token}`)}`);
  return "Verification email sent.";
});

export const updateProfile = action(z.object({
  full_name: text(2, 80, "Your name"), phone: optional(20), university_id: id,
}), async (d, form) => {
  const u = await requireUser();
  const avatar = form.get("avatar") as File | null;
  const path = avatar && avatar.size ? await saveImage(avatar, "avatars", u.id) : null;
  await asUser(u.id, (db) => db.run(
    "update users set full_name=$2, phone=$3, university_id=$4, avatar_path=coalesce($5, avatar_path) where id=$1",
    [u.id, d.full_name, d.phone, d.university_id, path]));
  return "Profile saved.";
});

export const changePassword = action(z.object({ current: z.string(), password }), async (d) => {
  const u = await requireUser();
  await rateLimit(`pw:${u.id}`, 5, 900);
  await asSystem(async (db) => {
    const row = await db.one("select password_hash from users where id=$1", [u.id]);
    if (!(await verifyPassword(d.current, row.password_hash))) throw new ActionError("Your current password isn't right.");
    await db.run("update users set password_hash=$2 where id=$1", [u.id, await hashPassword(d.password)]);
  });
  return "Password changed.";
});

export const submitStudentEmail = action(z.object({ student_email: email, matric_number: optional(30) }), async (d) => {
  const u = await requireUser();
  await rateLimit(`student:${u.id}`, 5, 3600);
  const token = await asSystem(async (db) => {
    const uni = await db.one("select * from universities where id=$1", [u.university_id]);
    if (!uni?.verification_methods.includes("student_email")) throw new ActionError("Your university doesn't support email verification.");
    const domain = d.student_email.split("@")[1];
    if (!uni.student_email_domains.includes(domain))
      throw new ActionError(`Use your ${uni.short_name} student email (${uni.student_email_domains.join(" or ")}).`);
    const v = await db.one(
      "insert into student_verifications(user_id,university_id,method,student_email,matric_number) values ($1,$2,'student_email',$3,$4) returning id",
      [u.id, uni.id, d.student_email, d.matric_number]);
    await db.run("update users set student_status='pending' where id=$1", [u.id]);
    return issueToken(db, u.id, "student_email", 24, { verification_id: v.id });
  });
  await sendEmail(d.student_email, "Confirm your student email", `Confirm you're a student: ${appUrl(`/verify-student?token=${token}`)}`);
  return `Confirmation sent to ${d.student_email}.`;
});

export const submitIdUpload = action(z.object({ matric_number: text(3, 30, "Matric number") }), async (d, form) => {
  const u = await requireUser();
  const file = form.get("document") as File | null;
  if (!file?.size) throw new ActionError("Add a photo of your student ID.");
  const path = await saveImage(file, "student-ids", u.id, true);
  await asSystem(async (db) => {
    const uni = await db.one("select * from universities where id=$1", [u.university_id]);
    if (!uni?.verification_methods.includes("id_upload")) throw new ActionError("Your university doesn't accept ID uploads.");
    await db.run("insert into student_verifications(user_id,university_id,method,matric_number,document_path) values ($1,$2,'id_upload',$3,$4)", [u.id, uni.id, d.matric_number, path]);
    await db.run("update users set student_status='pending' where id=$1", [u.id]);
  });
  return "Submitted. An admin will review your ID.";
});

export const applyForSeller = action(z.object({
  business_name: text(2, 80, "Business name"), business_type: text(2, 60, "Business type"), pitch: text(20, 800, "Your description"),
}), async (d) => {
  const u = await requireUser();
  if (!u.email_verified_at) throw new ActionError("Verify your email first.");
  if (u.student_status !== "verified") throw new ActionError("Verify your student status first.");
  await asSystem((db) => db.run(
    `insert into seller_profiles(user_id,business_name,business_type,pitch) values ($1,$2,$3,$4)
     on conflict (user_id) do update set business_name=$2, business_type=$3, pitch=$4, status='pending', review_note=null
     where seller_profiles.status='rejected'`, [u.id, d.business_name, d.business_type, d.pitch]));
  return "Application sent. You'll get a notification when it's reviewed.";
});
