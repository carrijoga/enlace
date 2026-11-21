import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDemoDocument,
  MAX_ACTIVE_SHARE_LINKS,
  shareLinkListResponseSchema,
  shareLinkSchema,
  sharedViewSchema,
  type CeremonyProject,
} from '@enlace/contracts';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { createShareLinkStore } from './projects/share-links.js';
import { createProjectStore } from './projects/store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const NOTE = 'nota-privada-integracao';

describe.skipIf(!databaseUrl)('links de visualização com PostgreSQL real', () => {
  const schema = `enlace_share_${randomUUID().replaceAll('-', '')}`;
  const origin = 'http://localhost:5173';
  const password = 'Senha-ficticia-teste-123!';
  const secret = 'segredo-ficticio-de-links-0123456789';
  let admin: Pool;
  let pool: Pool;
  let app: ReturnType<typeof createApp>;
  let otherSecretApp: ReturnType<typeof createApp>;
  let cookieA: string;
  let cookieB: string;
  const projectA = randomUUID();
  const projectB = randomUUID();
  let project: CeremonyProject;

  function request(path: string, method = 'GET', cookie = '', body?: unknown, target = app) {
    return target.request(origin + path, {
      method,
      headers: { origin, cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const view = (token: string, target = app) =>
    request('/api/shared/view', 'POST', '', { token }, target);
  async function createLink(
    cookie: string,
    projectId: string,
    body: { label: string; mode: 'names' | 'plan'; expiresInDays: 7 | 30 | 90 | null },
  ) {
    const response = await request(`/api/projects/${projectId}/share-links`, 'POST', cookie, body);
    expect(response.status).toBe(201);
    return shareLinkSchema.parse(await response.json());
  }
  async function signUp(email: string) {
    const response = await request('/api/auth/sign-up/email', 'POST', '', {
      email,
      name: 'Pessoa fictícia',
      password,
    });
    expect(response.status).toBe(200);
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
    };
    const auth = createAuth(pool, config, async () => undefined);
    const projectStore = createProjectStore(pool);
    app = createApp(config, {
      checkReadiness: async () => undefined,
      auth,
      projectStore,
      shareLinks: createShareLinkStore(pool, secret),
    });
    otherSecretApp = createApp(config, {
      checkReadiness: async () => undefined,
      auth,
      projectStore,
      shareLinks: createShareLinkStore(pool, 'outro-segredo-ficticio-0123456789ab'),
    });
    cookieA = await signUp('lia.share@example.test');
    cookieB = await signUp('noah.share@example.test');

    project = createDemoDocument().project;
    const seats = project.layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]);
    const seated = {
      id: randomUUID(),
      name: 'Convidada Sentada',
      category: 'madrinha',
      note: NOTE,
    };
    const unseated = {
      id: randomUUID(),
      name: 'Convidado Sem Lugar',
      category: 'convidado',
      note: NOTE,
    };
    project.guests = [seated, unseated] as CeremonyProject['guests'];
    project.assignments = [{ seatId: seats[3]!, guestId: seated.id }];
    for (const [cookie, id] of [
      [cookieA, projectA],
      [cookieB, projectB],
    ] as const)
      expect(
        (await request('/api/projects', 'POST', cookie, { id, operationId: randomUUID(), project }))
          .status,
      ).toBe(201);
  }, 30_000);
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('cria, lista e abre sem sessão, nos dois modos, sem dados privados', async () => {
    const names = await createLink(cookieA, projectA, {
      label: 'Família',
      mode: 'names',
      expiresInDays: 30,
    });
    const plan = await createLink(cookieA, projectA, {
      label: 'Cerimonialista',
      mode: 'plan',
      expiresInDays: null,
    });
    const days = (Date.parse(names.expiresAt!) - Date.parse(names.createdAt)) / 86_400_000;
    expect(days).toBeCloseTo(30, 5);
    expect(plan.expiresAt).toBeNull();

    const listed = shareLinkListResponseSchema.parse(
      await (await request(`/api/projects/${projectA}/share-links`, 'GET', cookieA)).json(),
    );
    expect(listed.links.map((link) => link.label)).toEqual(['Família', 'Cerimonialista']);
    expect(listed.links[0]!.token).toBe(names.token);

    const namesResponse = await view(names.token);
    expect(namesResponse.status).toBe(200);
    const namesText = await namesResponse.text();
    const namesView = sharedViewSchema.parse(JSON.parse(namesText));
    expect(namesView).toMatchObject({
      mode: 'names',
      seats: [{ name: 'Convidada Sentada', category: 'madrinha' }],
    });
    for (const forbidden of [NOTE, 'Convidado Sem Lugar', project.title, projectA, 'Família'])
      expect(namesText).not.toContain(forbidden);

    const planText = await (await view(plan.token)).text();
    expect(sharedViewSchema.parse(JSON.parse(planText))).toMatchObject({
      mode: 'plan',
      occupiedSeatIds: [project.assignments[0]!.seatId],
    });
    for (const forbidden of [NOTE, 'Convidada Sentada', 'madrinha', project.title, projectA])
      expect(planText).not.toContain(forbidden);
  });

  it('mostra a última revisão salva, e criar link não muda a revisão do projeto', async () => {
    const before = await (await request(`/api/projects/${projectA}`, 'GET', cookieA)).json();
    const link = await createLink(cookieA, projectA, {
      label: 'Revisão',
      mode: 'names',
      expiresInDays: 7,
    });
    const after = await (await request(`/api/projects/${projectA}`, 'GET', cookieA)).json();
    expect(after.revision).toBe(before.revision);
    const renamed = {
      ...project,
      guests: project.guests.map((guest, index) =>
        index === 0 ? { ...guest, name: 'Nome Atualizado' } : guest,
      ),
    };
    const saved = await request(`/api/projects/${projectA}`, 'PUT', cookieA, {
      expectedRevision: after.revision,
      operationId: randomUUID(),
      project: renamed,
    });
    expect(saved.status).toBe(200);
    expect(await (await view(link.token)).json()).toMatchObject({
      seats: [{ name: 'Nome Atualizado' }],
    });
  });

  it('isola contas: outra conta não lista, cria nem desativa links de quem não é dona', async () => {
    const link = await createLink(cookieA, projectA, {
      label: 'Isolamento',
      mode: 'plan',
      expiresInDays: 7,
    });
    expect((await request(`/api/projects/${projectA}/share-links`, 'GET', cookieB)).status).toBe(
      404,
    );
    expect(
      (
        await request(`/api/projects/${projectA}/share-links`, 'POST', cookieB, {
          label: 'Invasão',
          mode: 'names',
          expiresInDays: null,
        })
      ).status,
    ).toBe(404);
    for (const path of [
      `/api/projects/${projectA}/share-links/${link.id}`,
      // Com o próprio projeto no caminho, o link de outro projeto também não é encontrado.
      `/api/projects/${projectB}/share-links/${link.id}`,
    ])
      expect((await request(path, 'DELETE', cookieB, {})).status).toBe(404);
    expect((await view(link.token)).status).toBe(200);
    expect((await request(`/api/projects/${projectA}/share-links`, 'GET')).status).toBe(401);
  });

  it('o token não vale como sessão nem permite escrita', async () => {
    const link = await createLink(cookieA, projectA, {
      label: 'Somente leitura',
      mode: 'names',
      expiresInDays: 7,
    });
    const asBearer = (method: string, path: string, body?: unknown) =>
      app.request(origin + path, {
        method,
        headers: {
          origin,
          'content-type': 'application/json',
          authorization: `Bearer ${link.token}`,
          cookie: `better-auth.session_token=${link.token}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    expect((await asBearer('GET', `/api/projects/${projectA}`)).status).toBe(401);
    expect(
      (
        await asBearer('PUT', `/api/projects/${projectA}`, {
          expectedRevision: 1,
          operationId: randomUUID(),
          project,
        })
      ).status,
    ).toBe(401);
    expect(
      (await asBearer('DELETE', `/api/projects/${projectA}`, { expectedRevision: 1 })).status,
    ).toBe(401);
    expect((await asBearer('GET', `/api/projects/${projectA}/share-links`)).status).toBe(401);
  });

  it('desativado, vencido ou de outro segredo responde igual a inexistente', async () => {
    const revoked = await createLink(cookieA, projectA, {
      label: 'Desativar',
      mode: 'names',
      expiresInDays: 7,
    });
    const path = `/api/projects/${projectA}/share-links/${revoked.id}`;
    expect((await request(path, 'DELETE', cookieA, {})).status).toBe(204);
    expect((await request(path, 'DELETE', cookieA, {})).status).toBe(204);
    const gone = await view(revoked.token);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'not_found' });

    const expired = await createLink(cookieA, projectA, {
      label: 'Vencido',
      mode: 'names',
      expiresInDays: 7,
    });
    await pool.query(
      `UPDATE project_share_links SET created_at=now()-interval '8 days', expires_at=now()-interval '1 day' WHERE id=$1`,
      [expired.id],
    );
    expect((await view(expired.token)).status).toBe(404);
    const listed = shareLinkListResponseSchema.parse(
      await (await request(`/api/projects/${projectA}/share-links`, 'GET', cookieA)).json(),
    );
    expect(listed.links.map((link) => link.id)).not.toContain(revoked.id);
    expect(listed.links.map((link) => link.id)).not.toContain(expired.id);

    const valid = listed.links[0]!;
    expect((await view(valid.token, otherSecretApp)).status).toBe(404);
  });

  it('mantém o limite de links ativos com criações simultâneas', async () => {
    const id = randomUUID();
    expect(
      (await request('/api/projects', 'POST', cookieB, { id, operationId: randomUUID(), project }))
        .status,
    ).toBe(201);
    const results = await Promise.all(
      Array.from({ length: MAX_ACTIVE_SHARE_LINKS + 3 }, (_, index) =>
        request(`/api/projects/${id}/share-links`, 'POST', cookieB, {
          label: `Link ${index}`,
          mode: 'plan',
          expiresInDays: null,
        }),
      ),
    );
    const statuses = results.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(MAX_ACTIVE_SHARE_LINKS);
    expect(statuses.filter((status) => status === 409)).toHaveLength(3);
    const active = await pool.query(
      'SELECT count(*)::int AS n FROM project_share_links WHERE project_id=$1 AND revoked_at IS NULL',
      [id],
    );
    expect(active.rows[0]!.n).toBe(MAX_ACTIVE_SHARE_LINKS);
  });

  it('excluir o projeto remove os links e o acesso público', async () => {
    const link = await createLink(cookieB, projectB, {
      label: 'Exclusão',
      mode: 'names',
      expiresInDays: null,
    });
    const current = await (await request(`/api/projects/${projectB}`, 'GET', cookieB)).json();
    expect(
      (
        await request(`/api/projects/${projectB}`, 'DELETE', cookieB, {
          expectedRevision: current.revision,
        })
      ).status,
    ).toBe(204);
    expect((await view(link.token)).status).toBe(404);
    const left = await pool.query(
      'SELECT count(*)::int AS n FROM project_share_links WHERE id=$1',
      [link.id],
    );
    expect(left.rows[0]!.n).toBe(0);
  });
});
