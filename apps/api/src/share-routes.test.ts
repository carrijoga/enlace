import { describe, expect, it, vi } from 'vitest';
import { createApp, type ShareLinkStore } from './app.js';
import type { ApiConfig } from './config.js';
import { ProjectStoreError } from './projects/store.js';

const config: ApiConfig = {
  port: 3001,
  webOrigin: 'http://localhost:5173',
  version: '0.1.0',
  production: false,
};
const projectId = '1a2b3c4d-1111-4111-8111-111111111111';
const linkId = '1a2b3c4d-2222-4222-8222-222222222222';
const token = 'A'.repeat(64);
const json = { origin: config.webOrigin, 'content-type': 'application/json' };

function setup(session: string | null = 'owner-a') {
  const shareLinks = {
    linkIdOf: vi.fn((value: unknown) => (value === token ? linkId : null)),
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: linkId })),
    revoke: vi.fn(async () => undefined),
    view: vi.fn(async () => ({ mode: 'plan' })),
    redeem: vi.fn(async () => ({ projectId })),
  } satisfies ShareLinkStore;
  const getSession = vi.fn(async () => (session ? { user: { id: session } } : null));
  const app = createApp(config, {
    checkReadiness: async () => undefined,
    auth: { handler: vi.fn(), api: { getSession } },
    shareLinks,
  });
  return { app, shareLinks, getSession };
}

describe('rotas de gerenciamento de links', () => {
  it('exigem sessão e passam o dono da sessão, nunca um dono do corpo', async () => {
    const { app, shareLinks } = setup();
    const created = await app.request(`/api/projects/${projectId}/share-links`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ label: 'Família', mode: 'names', expiresInDays: 30 }),
    });
    expect(created.status).toBe(201);
    expect(shareLinks.create).toHaveBeenCalledWith('owner-a', projectId, {
      label: 'Família',
      mode: 'names',
      expiresInDays: 30,
    });
    const forged = await app.request(`/api/projects/${projectId}/share-links`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ label: 'X', mode: 'names', expiresInDays: 7, ownerId: 'owner-b' }),
    });
    expect(forged.status).toBe(400);
    expect(shareLinks.create).toHaveBeenCalledTimes(1);

    const { app: anonymous, shareLinks: untouched } = setup(null);
    expect(
      (await anonymous.request(`/api/projects/${projectId}/share-links`, { headers: json })).status,
    ).toBe(401);
    expect(untouched.list).not.toHaveBeenCalled();
  });

  it('exigem a origem da web para criar e desativar', async () => {
    const { app, shareLinks } = setup();
    for (const [method, path] of [
      ['POST', `/api/projects/${projectId}/share-links`],
      ['DELETE', `/api/projects/${projectId}/share-links/${linkId}`],
    ] as const) {
      const response = await app.request(path, {
        method,
        headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(403);
    }
    expect(shareLinks.create).not.toHaveBeenCalled();
    expect(shareLinks.revoke).not.toHaveBeenCalled();
  });

  it('desativar recebe corpo vazio e responde 204', async () => {
    const { app, shareLinks } = setup();
    const path = `/api/projects/${projectId}/share-links/${linkId}`;
    expect((await app.request(path, { method: 'DELETE', headers: json, body: '{}' })).status).toBe(
      204,
    );
    expect(shareLinks.revoke).toHaveBeenCalledWith('owner-a', projectId, linkId);
    expect(
      (await app.request(path, { method: 'DELETE', headers: json, body: '{"x":1}' })).status,
    ).toBe(400);
  });

  it('mapeiam o limite de links para 409', async () => {
    const { app, shareLinks } = setup();
    shareLinks.create.mockRejectedValueOnce(new ProjectStoreError(409, 'share_link_limit'));
    const response = await app.request(`/api/projects/${projectId}/share-links`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ label: 'Família', mode: 'plan', expiresInDays: null }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'share_link_limit' });
  });

  it('respondem 503 explícito quando o compartilhamento não está configurado', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const response = await app.request(`/api/projects/${projectId}/share-links`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'sharing_unavailable' });
  });
});

describe('resgate de links para contas', () => {
  const path = '/api/shared/redeem';
  const send = (app: ReturnType<typeof createApp>, input: unknown, headers = json) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(input) });

  it('exige sessão, origem e modo de participação explícito', async () => {
    const input = { mode: 'edit', token };
    const { app, shareLinks } = setup('destinatario');
    expect((await send(setup(null).app, input)).status).toBe(401);
    expect((await send(app, input, { ...json, origin: 'https://outra.example' })).status).toBe(403);
    for (const body of [{ token }, { token, mode: 'names' }, { ...input, userId: 'outro' }])
      expect((await send(app, body)).status).toBe(400);
    expect(shareLinks.redeem).not.toHaveBeenCalled();
    for (const mode of ['edit', 'clone']) {
      const response = await send(app, { token, mode });
      expect(await response.json()).toEqual({ projectId });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(shareLinks.redeem).toHaveBeenCalledWith('destinatario', { token, mode });
    }
  });
});

describe('leitura pública', () => {
  it('não usa sessão, exige origem e JSON e marca a resposta como não indexável', async () => {
    const { app, shareLinks, getSession } = setup(null);
    const response = await app.request('/api/shared/view', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ token }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(shareLinks.view).toHaveBeenCalledWith(token);
    expect(getSession).not.toHaveBeenCalled();
    expect(
      (
        await app.request('/api/shared/view', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/shared/view', {
          method: 'POST',
          headers: { origin: config.webOrigin },
          body: JSON.stringify({ token }),
        })
      ).status,
    ).toBe(400);
  });

  it('token malformado ou forjado responde igual a link inexistente, sem consultar o banco', async () => {
    const { app, shareLinks } = setup();
    for (const body of [{ token: 'curto' }, { token: 'B'.repeat(64) }, {}, { token, extra: 1 }]) {
      const response = await app.request('/api/shared/view', {
        method: 'POST',
        headers: json,
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    }
    expect(shareLinks.view).not.toHaveBeenCalled();
  });

  it('link desativado ou vencido responde 404 genérico', async () => {
    const { app, shareLinks } = setup();
    shareLinks.view.mockRejectedValueOnce(new ProjectStoreError(404, 'not_found'));
    const response = await app.request('/api/shared/view', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ token }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('o token não aparece no log de requisição', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const { app } = setup();
      await app.request('/api/shared/view', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ token }),
      });
      const logged = info.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).toContain('/api/shared/view');
      expect(logged).not.toContain(token);
    } finally {
      info.mockRestore();
    }
  });

  it('limita leituras por link com 429 e Retry-After', async () => {
    const { app } = setup();
    let last: Response | undefined;
    for (let attempt = 0; attempt <= 600; attempt++)
      last = await app.request('/api/shared/view', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ token }),
      });
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
