import pg from "pg";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl:
    env.DATABASE_SSL_MODE === "disable"
      ? undefined
      : {
          rejectUnauthorized: env.DATABASE_SSL_MODE === "verify-full",
          ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}),
        },
});

pool.on("error", (err) => {
  logger.error("pg pool beklenmeyen hata", { message: err.message });
});

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query(text, params as unknown[]);
  const duration = Date.now() - start;
  if (duration > 200) {
    logger.warn("yavas sorgu", { duration, text: text.slice(0, 120) });
  }
  return res as unknown as QueryResult<T>;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
  logger.info("postgres pool kapatildi");
}
