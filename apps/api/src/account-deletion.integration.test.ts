import { createHmac, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDemoDocument } from '@enlace/contracts';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { createProjectStore } from './projects/store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Exclusão de conta e login Google (PostgreSQL)', () => {
  const schema = `enlace_del_${randomUUID().replaceAll('-', '')}`;
  const origin = 'http://localhost:5173';
  const secret = 'synthetic-integration-secret-0123456789';
  const password = 'Senha-ficticia-teste-123!';
  let admin: Pool;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let auth: NonNullable<ReturnType<typeof createAuth>>;

  function request(path: string, method = 'GET', cookie = '', body?: unknown) {
    return app.request(origin + path, {
      method,
      headers: { origin, cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  // Usuário só Google: usuário + conta `google` + sessão criados direto no adapter (não há OAuth
  // real em teste). O cookie é assinado como o Better Auth faz: `token.base64(hmac-sha256)`.
  async function googleUser(email: string, sessionAgeSeconds = 0) {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      {
        email,
        name: 'Gina fictícia',
        emailVerified: true,
      },
      { method: 'oauth', oauth: { providerId: 'google' } },
    );
    await ctx.internalAdapter.createAccount({
      userId: user.id,
      providerId: 'google',
      accountId: `google-${randomUUID()}`,
    });
    const session = await ctx.internalAdapter.createSession(user.id, false);
    if (sessionAgeSeconds > 0) {
      await pool.query(
        'UPDATE session SET created_at = now() - make_interval(secs => $2) WHERE id=$1',
        [session.id, sessionAgeSeconds],
      );
    }
    const signature = createHmac('sha256', secret).update(session.token).digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;
    return { userId: user.id, cookie };
  }
  async function createProject(ownerCookie: string) {
    const id = randomUUID();
    const project = createDemoDocument().project;
    project.weddingDate = '2027-05-22';
    const response = await request('/api/projects', 'POST', ownerCookie, {
      id,
      operationId: randomUUID(),
      project,
    });
    expect(response.status).toBe(201);
    return id;
  }
  const count = async (sql: string, args: unknown[]) => (await pool.query(sql, args)).rowCount;

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
      production: false,
      webOrigin: origin,
      version: 'test',
      authSecret: secret,
      googleClientId: 'cliente-ficticio.apps.example',
      googleClientSecret: 'segredo-ficticio',
    };
    auth = createAuth(pool, config)!;
    app = createApp(config, {
      checkReadiness: async () => undefined,
      auth,
      projectStore: createProjectStore(pool),
    });
  }, 30_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('inicia o login Google com seleção de conta e redirect URI do domínio web', async () => {
    const response = await request('/api/auth/sign-in/social', 'POST', '', {
      provider: 'google',
      callbackURL: `${origin}/projetos`,
      errorCallbackURL: `${origin}/conta`,
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const target = new URL(url);
    expect(target.host).toBe('accounts.google.com');
    expect(target.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`);
    expect(target.searchParams.get('prompt')).toBe('select_account');
  });

  it('lista a conta Google do usuário sem credencial', async () => {
    const user = await googleUser('lista@example.test');
    const response = await request('/api/auth/list-accounts', 'GET', user.cookie);
    expect(response.status).toBe(200);
    const accounts = (await response.json()) as { providerId: string }[];
    expect(accounts.map((item) => item.providerId)).toEqual(['google']);
  });

  it('exclui conta só Google com sessão recente, sem senha, e apaga seus dados', async () => {
    const google = await googleUser('gina@example.test');
    const other = await googleUser('outro@example.test');
    const mine = await createProject(google.cookie);
    const theirs = await createProject(other.cookie);

    const deleted = await request('/api/auth/delete-user', 'POST', google.cookie, {});
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ success: true, message: 'User deleted' });
    expect(await count('SELECT id FROM "user" WHERE id=$1', [google.userId])).toBe(0);
    expect(await count('SELECT id FROM account WHERE user_id=$1', [google.userId])).toBe(0);
    expect(await count('SELECT id FROM session WHERE user_id=$1', [google.userId])).toBe(0);
    expect(await count('SELECT id FROM projects WHERE id=$1', [mine])).toBe(0);
    // O outro usuário continua intacto.
    expect(await count('SELECT id FROM "user" WHERE id=$1', [other.userId])).toBe(1);
    expect(
      await count("SELECT id FROM account WHERE user_id=$1 AND provider_id='google'", [
        other.userId,
      ]),
    ).toBe(1);
    expect(await count('SELECT id FROM projects WHERE id=$1', [theirs])).toBe(1);
  });

  it('exige novo login Google quando a sessão tem mais de 10 minutos', async () => {
    const old = await googleUser('antiga@example.test', 601);
    const project = await createProject(old.cookie);
    const response = await request('/api/auth/delete-user', 'POST', old.cookie, {});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(await count('SELECT id FROM "user" WHERE id=$1', [old.userId])).toBe(1);
    expect(await count('SELECT id FROM account WHERE user_id=$1', [old.userId])).toBe(1);
    expect(await count('SELECT id FROM projects WHERE id=$1', [project])).toBe(1);
  });

  it('mantém PASSWORD_REQUIRED para conta com senha e responde 401 sem sessão', async () => {
    const signUp = await request('/api/auth/sign-up/email', 'POST', '', {
      email: 'senha@example.test',
      name: 'Sara fictícia',
      password,
    });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers
      .getSetCookie()
      .map((item) => item.split(';')[0])
      .join('; ');
    const userId = ((await signUp.json()) as { user: { id: string } }).user.id;
    const missing = await request('/api/auth/delete-user', 'POST', cookie, {});
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: 'PASSWORD_REQUIRED' });
    expect(await count('SELECT id FROM "user" WHERE id=$1', [userId])).toBe(1);
    expect((await request('/api/auth/delete-user', 'POST', '', {})).status).toBe(401);
  });
});
