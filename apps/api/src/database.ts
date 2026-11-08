import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createAuth } from './auth.js';
import type { ApiConfig } from './config.js';

let pool: Pool | undefined;

export function getPool(databaseUrl: string): Pool {
  pool ??= new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

export function getDatabase(databaseUrl: string) {
  return drizzle(getPool(databaseUrl));
}

export function getAuth(config: ApiConfig) {
  if (!config.databaseUrl) return undefined;
  return createAuth(getPool(config.databaseUrl), config);
}

export async function checkDatabase(databaseUrl?: string): Promise<void> {
  if (!databaseUrl) throw new Error('database_unavailable');
  await getPool(databaseUrl).query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    const currentPool = pool;
    pool = undefined;
    await currentPool.end();
  }
}
