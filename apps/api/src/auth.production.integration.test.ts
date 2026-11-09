import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from './auth.js';
import { createApp } from './app.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('cookies seguros de produção com Better Auth', () => {
  const schema = `enlace_auth_${randomUUID().replaceAll('-', '')}`;
  const origin = 'https://enlace.example.test';
  let admin: Pool;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    const folder = resolve(import.meta.dirname, '../drizzle');
    for (const filename of (await readdir(folder))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(resolve(folder, filename), 'utf8');
      await pool.query(sql.replaceAll('"public".', `"${schema}".`));
    }
    const config = {
      port: 3001,
      production: true,
      webOrigin: origin,
      version: 'test',
      authSecret: 'synthetic-production-secret-0123456789',
    };
    app = createApp(config, {
      checkReadiness: async () => undefined,
      auth: createAuth(pool, config),
    });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('emits Secure, HttpOnly, SameSite=Lax cookies over the production origin', async () => {
    const response = await app.request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'prod@example.test',
        name: 'Conta fictícia',
        password: 'Senha-ficticia-producao-123!',
      }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
});
