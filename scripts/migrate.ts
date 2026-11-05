import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  if (process.argv.includes("--reset")) {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
    await client.query("drop schema public cascade; create schema public;");
  }
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now()); alter table schema_migrations enable row level security");
  const dir = join(process.cwd(), "db/migrations");
  for (const file of readdirSync(dir).sort()) {
    const done = await client.query("select 1 from schema_migrations where name = $1", [file]);
    if (done.rowCount) continue;
    await client.query("begin");
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("insert into schema_migrations(name) values ($1)", [file]);
    await client.query("commit");
    console.log("applied", file);
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
