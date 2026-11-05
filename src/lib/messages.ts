import type { Db } from "./db";

export async function loadThread(db: Db, id: string, me: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const c = await db.one(
    `select c.id, c.buyer_id, s.name store, s.owner_id, b.full_name buyer from conversations c
     join storefronts s on s.id=c.storefront_id join users b on b.id=c.buyer_id where c.id=$1 and (c.buyer_id=$2 or s.owner_id=$2)`, [id, me]);
  if (!c) return null;
  await db.run("update messages set read_at=now() where conversation_id=$1 and sender_id<>$2 and read_at is null", [id, me]);
  const messages = await db.rows(
    `select m.id, m.body, m.sender_id, m.created_at, l.title listing_title, l.slug listing_slug, o.number order_number
     from messages m left join listings l on l.id=m.listing_id left join orders o on o.id=m.order_id
     where m.conversation_id=$1 order by m.created_at limit 300`, [id]);
  return { title: c.buyer_id === me ? c.store : c.buyer, messages };
}
