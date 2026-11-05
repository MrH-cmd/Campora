import type { Db } from "./db";

export const getSetting = async <T,>(db: Db, key: string, fallback: T): Promise<T> =>
  (await db.one<{ value: T }>("select value from platform_settings where key = $1", [key]))?.value ?? fallback;

export const commissionBps = (db: Db) => getSetting<number>(db, "commission_bps", 500);
