import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(here, '../../drizzle');

/** Apply checked-in SQL migrations once, in lexical order, under a PostgreSQL advisory lock. */
export async function migrate(databaseUrl: string): Promise<string[]> {
  if (!databaseUrl) throw new Error('DATABASE_URL obrigatória');
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    const migrationRole = process.env.PG_MIGRATOR_ROLE;
    if (migrationRole) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(migrationRole)) throw new Error('PG_MIGRATOR_ROLE inválida');
      await client.query(`SET ROLE "${migrationRole}"`);
    }
    await client.query('SELECT pg_advisory_lock(728193401)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.enlace_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const runtimeRoleExists = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='enlace_runtime'",
    );
    if (runtimeRoleExists.rowCount)
      await client.query('REVOKE ALL ON TABLE public.enlace_migrations FROM enlace_runtime');
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const exists = await client.query('SELECT 1 FROM public.enlace_migrations WHERE name=$1', [
        name,
      ]);
      if (exists.rowCount) continue;
      const sql = await readFile(resolve(migrationsDirectory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.enlace_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(728193401)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Na hospedagem o pre-deploy herda as variáveis do serviço; a credencial de migração é separada da runtime.
  const databaseUrl = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('MIGRATOR_DATABASE_URL ou DATABASE_URL obrigatória');
  const applied = await migrate(databaseUrl);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco atualizado');
}
