import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { loadThread } from "@/lib/messages";

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser(`/messages/${id}`);
  const t = await asUser(u.id, (db) => loadThread(db, id, u.id));
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/messages" className="text-sm font-medium text-mute">All messages</Link>
      <h1 className="mt-1 text-2xl font-bold">{t.title}</h1>
      <Chat id={id} me={u.id} initial={t.messages} />
    </div>
  );
}
