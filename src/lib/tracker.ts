import type { Db } from "./db";

/** RLS decides who can see the order; a null result means this user can't. */
export async function loadTracker(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const o = await db.one("select service_stage, service_expected_at, appointment from orders where id=$1", [id]);
  if (!o) return null;
  return {
    stage: o.service_stage as string | null, expected: o.service_expected_at, appointment: o.appointment as string | null,
    updates: await db.rows("select id, stage, note, created_at from service_updates where order_id=$1 order by created_at", [id]),
    location: await db.one("select latitude, longitude, updated_at from service_locations where order_id=$1 and is_sharing and updated_at > now()-interval '10 minutes'", [id]),
  };
}
