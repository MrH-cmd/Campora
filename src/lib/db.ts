import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global { var __camporaPool: Pool | undefined; }

function pool() {
  if (!global.__camporaPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    global.__camporaPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
  }
  return global.__camporaPool;
}

export type Db = {
  rows: <T extends QueryResultRow = any>(text: string, params?: unknown[]) => Promise<T[]>;
  one: <T extends QueryResultRow = any>(text: string, params?: unknown[]) => Promise<T | null>;
  run: (text: string, params?: unknown[]) => Promise<number>;
};

const wrap = (c: PoolClient): Db => ({
  rows: async (t, p) => (await c.query(t, p as any[])).rows,
  one: async (t, p) => (await c.query(t, p as any[])).rows[0] ?? null,
  run: async (t, p) => (await c.query(t, p as any[])).rowCount ?? 0,
});

async function transaction<T>(setup: (c: PoolClient) => Promise<void>, fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await setup(c);
    const result = await fn(wrap(c));
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Runs under Row Level Security as this user (or anonymously when null). */
export function asUser<T>(userId: string | null, fn: (db: Db) => Promise<T>) {
  return transaction(async (c) => {
    await c.query("set local role campora_app");
    await c.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);
  }, fn);
}

/** Bypasses RLS. Only for trusted server logic that has already authorised the caller. */
export function asSystem<T>(fn: (db: Db) => Promise<T>) {
  return transaction(async () => {}, fn);
}

export const read = <T extends QueryResultRow = any>(userId: string | null, text: string, params?: unknown[]) =>
  asUser(userId, (db) => db.rows<T>(text, params));
