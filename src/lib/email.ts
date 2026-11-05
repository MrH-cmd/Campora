import { asSystem } from "./db";

/** Sends with Resend when EMAIL_DRIVER=resend. Otherwise keeps the mail in email_outbox for /dev/mailbox. */
export async function sendEmail(to: string, subject: string, body: string) {
  if (process.env.EMAIL_DRIVER === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text: body }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text());
    return;
  }
  await asSystem((db) => db.run("insert into email_outbox(to_email, subject, body) values ($1,$2,$3)", [to, subject, body]));
}

export const appUrl = (path = "") => `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;
