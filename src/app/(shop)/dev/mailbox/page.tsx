import { notFound } from "next/navigation";
import { asSystem } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Development only: shows email that would have gone out. Disabled when a real email driver is set. */
export default async function Mailbox() {
  if (process.env.EMAIL_DRIVER !== "outbox") notFound();
  const rows = await asSystem((db) => db.rows("select * from email_outbox order by created_at desc limit 30"));
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Development mailbox</h1>
      <ul className="mt-4 space-y-2">{rows.map((m) => (
        <li key={m.id} className="rounded-xl border border-line bg-white p-3 text-sm" data-to={m.to_email}><p className="font-semibold">{m.subject}</p><p className="text-mute">To {m.to_email}</p><pre className="mt-1 whitespace-pre-wrap break-all">{m.body}</pre></li>
      ))}</ul>
    </div>
  );
}
