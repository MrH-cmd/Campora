import Link from "next/link";
import { Empty, Img, LinkButton, PageHead } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Messages" };
export default async function Inbox() {
  const u = await requireUser("/messages");
  const rows = await asUser(u.id, (db) => db.rows(
    `select c.id, c.last_message_at, c.buyer_id, s.name store, s.logo_path, b.full_name buyer,
       (select body from messages m where m.conversation_id=c.id order by created_at desc limit 1) last,
       (select count(*)::int from messages m where m.conversation_id=c.id and m.sender_id<>$1 and m.read_at is null) unread
     from conversations c join storefronts s on s.id=c.storefront_id join users b on b.id=c.buyer_id
     where c.buyer_id=$1 or s.owner_id=$1 order by c.last_message_at desc limit 100`, [u.id]));
  return (
    <>
      <PageHead title="Messages" />
      {rows.length === 0 ? <Empty title="No conversations yet" body="Message a seller from any listing or storefront." action={<LinkButton href="/search">Browse Vybe Market</LinkButton>} /> : (
        <ul className="space-y-2">{rows.map((c) => (
          <li key={c.id}><Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded-tag border border-line bg-card p-3 hover:border-palm">
            <Img path={c.logo_path} alt="" className="size-12 rounded-xl" />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{c.buyer_id === u.id ? c.store : c.buyer}</p><p className="truncate text-sm text-mute">{c.last}</p></div>
            <div className="text-right text-xs text-mute">{timeAgo(c.last_message_at)}{c.unread > 0 && <span className="ml-auto mt-1 grid size-5 place-items-center rounded-full bg-palm font-bold text-white">{c.unread}</span>}</div>
          </Link></li>
        ))}</ul>
      )}
    </>
  );
}
