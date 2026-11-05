import Link from "next/link";
import { markAllRead } from "@/app/actions/shop";
import { ActionButton } from "@/components/form";
import { Empty, PageHead } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Notifications" };
export default async function N() {
  const u = await requireUser("/notifications");
  const rows = await asUser(u.id, (db) => db.rows("select * from notifications where user_id=$1 order by created_at desc limit 50", [u.id]));
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PageHead title="Notifications" action={rows.some((r) => !r.read_at) ? <ActionButton action={markAllRead}>Mark all read</ActionButton> : undefined} />
      {rows.length === 0 ? <Empty title="You're all caught up" /> : (
        <ul className="space-y-2">{rows.map((n) => (
          <li key={n.id}><Link href={n.href ?? "#"} className={`block rounded-tag border p-3 ${n.read_at ? "border-line bg-white" : "border-palm/40 bg-mint-soft"}`}>
            <p className="font-medium">{n.title}</p>{n.body && <p className="text-sm text-ink-3">{n.body}</p>}<p className="mt-0.5 text-xs text-mute">{timeAgo(n.created_at)}</p>
          </Link></li>
        ))}</ul>
      )}
    </div>
  );
}
