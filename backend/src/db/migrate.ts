import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { pool, query } from "./client";
import { logger } from "../lib/logger";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
}

async function getApplied(): Promise<Set<string>> {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM schema_migrations ORDER BY id",
  );
  return new Set(rows.map((r) => r.id));
}

function listMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationsTable();
  const files = listMigrationFiles();
  const applied = await getApplied();
  const newlyApplied: string[] = [];
  const skipped: string[] = [];

  const client = await pool.connect();
  try {
    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) {
        skipped.push(id);
        continue;
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        await client.query("COMMIT");
        newlyApplied.push(id);
        logger.info(`migration uygulandi: ${id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`migration basarisiz: ${id}`, { message });
        throw new Error(`Migration '${id}' basarisiz: ${message}`);
      }
    }
  } finally {
    client.release();
  }

  logger.info(`migrationlar tamam. yeni: ${newlyApplied.length}, atlandi: ${skipped.length}`);
  return { applied: newlyApplied, skipped };
}

async function main(): Promise<void> {
  try {
    const res = await runMigrations();
    console.log(`\n✓ ${res.applied.length} yeni migration uygulandi, ${res.skipped.length} zaten uygulandi.`);
    process.exit(0);
  } catch (err) {
    console.error("\n✗ Migration hatasi:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
