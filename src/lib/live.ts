import type { Db } from "./db";

export const ONLINE_MINUTES = 3;

export const liveCounts = async (db: Db) => (await db.one<{ online: number; members: number; guests: number; registered: number }>(
  `select count(*)::int online, count(distinct user_id)::int members, (count(*) filter (where user_id is null))::int guests,
     (select count(*)::int from users where deleted_at is null) registered
   from presence where last_seen_at > now() - make_interval(mins => $1)`, [ONLINE_MINUTES]))!;
