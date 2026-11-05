import { asSystem } from "./db";

/** True when messages can really leave the app. Email checks are only enforced when this is true. */
export const emailEnabled = () => !!process.env.RESEND_API_KEY || process.env.EMAIL_DRIVER === "outbox";

/** Returns whether the email was accepted for delivery. Tokens are never stored unless the dev outbox is on. */
export async function sendEmail(to: string, subject: string, body: string) {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Vybe Market <onboarding@resend.dev>", to, subject, text: body }),
      signal: AbortSignal.timeout(10000),
    }).catch((e) => { console.error("Email request failed", e); return null; });
    if (!res?.ok) console.error("Email rejected", res?.status, await res?.text());
    return !!res?.ok;
  }
  if (process.env.EMAIL_DRIVER === "outbox") {
    await asSystem((db) => db.run("insert into email_outbox(to_email, subject, body) values ($1,$2,$3)", [to, subject, body]));
    return true;
  }
  console.warn("Email not sent: RESEND_API_KEY is not set");
  return false;
}

export const appUrl = (path = "") => `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
