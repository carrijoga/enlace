import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDemoDocument, projectSnapshotSchema } from '@enlace/contracts';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { createProjectStore } from './projects/store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('API integrada com sessões reais e PostgreSQL', () => {
  const schema = `enlace_api_${randomUUID().replaceAll('-', '')}`;
  const origin = 'http://localhost:5173';
  const password = 'Senha-ficticia-teste-123!';
  let admin: Pool;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;
  let userA: string;
  let resetUrl = '';
  const id = randomUUID();
  const project = createDemoDocument().project;
  project.weddingDate = '2027-05-22';

  function request(
    path: string,
    method = 'GET',
    cookie = '',
    body?: unknown,
    requestOrigin = origin,
  ) {
    return app.request(origin + path, {
      method,
      headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  function cookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }
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
      authSecret: 'synthetic-integration-secret-0123456789',
      smtpHost: 'mail.example.test',
      smtpPort: 587,
      smtpFrom: 'enlace@example.test',
    };
    app = createApp(config, {
      checkReadiness: async () => undefined,
      auth: createAuth(pool, config, async (_email, url) => {
        resetUrl = url;
      }),
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

  it('cadastra duas contas e cria cookies HttpOnly, sem expor hash da senha', async () => {
    const a = await request('/api/auth/sign-up/email', 'POST', '', {
      email: 'lia@example.test',
      name: 'Lia fictícia',
      password,
    });
    expect(a.status).toBe(200);
    const body = await a.json();
    userA = body.user.id;
    expect(body.user.password).toBeUndefined();
    expect(a.headers.get('set-cookie')).toContain('HttpOnly');
    expect(a.headers.get('set-cookie')).toContain('SameSite=Lax');
    cookieA = cookies(a);
    const b = await request('/api/auth/sign-up/email', 'POST', '', {
      email: 'noah@example.test',
      name: 'Noah fictício',
      password,
    });
    expect(b.status).toBe(200);
    cookieB = cookies(b);
    expect((await request('/api/auth/get-session', 'GET', cookieA)).status).toBe(200);
    const hashes = await pool.query('SELECT password FROM account');
    expect(hashes.rows.every((row) => row.password && row.password !== password)).toBe(true);
  });
  it('salva e reabre em outra sessão da mesma conta, preservando data e agregado', async () => {
    const create = await request('/api/projects', 'POST', cookieA, {
      id,
      operationId: randomUUID(),
      project,
    });
    expect(create.status).toBe(201);
    const snapshot = projectSnapshotSchema.parse(await create.json());
    expect(snapshot.project).toEqual(project);
    const login = await request('/api/auth/sign-in/email', 'POST', '', {
      email: 'lia@example.test',
      password,
    });
    expect(login.status).toBe(200);
    const reopened = await request(`/api/projects/${id}`, 'GET', cookies(login));
    expect(projectSnapshotSchema.parse(await reopened.json())).toEqual(snapshot);
  });
  it('nega leitura, escrita, exclusão e colisão de criação entre contas por chamada direta', async () => {
    expect(await (await request('/api/projects', 'GET', cookieB)).json()).toEqual({ projects: [] });
    for (const [method, body] of [
      ['GET', undefined],
      ['PUT', { expectedRevision: 1, operationId: randomUUID(), project }],
      ['DELETE', { expectedRevision: 1 }],
    ] as const) {
      expect((await request(`/api/projects/${id}`, method, cookieB, body)).status).toBe(404);
    }
    expect(
      (await request('/api/projects', 'POST', cookieB, { id, operationId: randomUUID(), project }))
        .status,
    ).toBe(404);
    expect((await request(`/api/projects/${id}`, 'GET')).status).toBe(401);
    expect(
      (
        await request(
          `/api/projects/${id}`,
          'PUT',
          cookieA,
          { expectedRevision: 1, operationId: randomUUID(), project },
          'https://attacker.test',
        )
      ).status,
    ).toBe(403);
  });
  it('detecta duas escritas simultâneas e repete uma confirmação perdida sem incrementar de novo', async () => {
    const operationId = randomUUID();
    const input = { expectedRevision: 1, operationId, project: { ...project, title: 'Versão A' } };
    const responses = await Promise.all([
      request(`/api/projects/${id}`, 'PUT', cookieA, input),
      request(`/api/projects/${id}`, 'PUT', cookieA, {
        ...input,
        operationId: randomUUID(),
        project: { ...project, title: 'Versão B' },
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = projectSnapshotSchema.parse(
      await (await request(`/api/projects/${id}`, 'GET', cookieA)).json(),
    );
    expect(current.revision).toBe(2);
    if (responses[0].status === 200) {
      const replay = await request(`/api/projects/${id}`, 'PUT', cookieA, input);
      expect(replay.status).toBe(200);
      expect((await replay.json()).revision).toBe(2);
    }
  });
  it('revoga logout e rejeita sessão expirada no servidor', async () => {
    const logout = await request('/api/auth/sign-out', 'POST', cookieB, {});
    expect(logout.status).toBe(200);
    expect((await request('/api/projects', 'GET', cookieB)).status).toBe(401);
    await pool.query("UPDATE session SET expires_at = now() - interval '1 hour' WHERE user_id=$1", [
      userA,
    ]);
    expect((await request(`/api/projects/${id}`, 'GET', cookieA)).status).toBe(401);
  });
  it('recupera senha com entrega capturada e invalida token usado e sessões antigas', async () => {
    const login = await request('/api/auth/sign-in/email', 'POST', '', {
      email: 'lia@example.test',
      password,
    });
    expect(login.status).toBe(200);
    const oldCookie = cookies(login);
    const recovery = await request('/api/auth/request-password-reset', 'POST', '', {
      email: 'lia@example.test',
      redirectTo: origin + '/conta?modo=redefinir',
    });
    expect(recovery.status).toBe(200);
    expect(new URL(resetUrl).origin).toBe(origin);
    const token = new URL(resetUrl).pathname.split('/').at(-1)!;
    const nextPassword = 'Nova-senha-ficticia-456!';
    const changed = await request('/api/auth/reset-password', 'POST', '', {
      token,
      newPassword: nextPassword,
    });
    expect(changed.status).toBe(200);
    expect((await request('/api/projects', 'GET', oldCookie)).status).toBe(401);
    expect(
      (await request('/api/auth/reset-password', 'POST', '', { token, newPassword: password }))
        .status,
    ).toBe(400);
    expect(
      (
        await request('/api/auth/sign-in/email', 'POST', '', {
          email: 'lia@example.test',
          password,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request('/api/auth/sign-in/email', 'POST', '', {
          email: 'lia@example.test',
          password: nextPassword,
        })
      ).status,
    ).toBe(200);
  });
});
