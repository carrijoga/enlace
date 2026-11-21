import { describe, expect, it, vi } from 'vitest';
import { proxyApi } from './api-proxy';

const origin = new URL('https://api.example.test');
const web = 'https://enlace.example.test';
describe('proxy autenticado same-origin', () => {
  it('encaminha cookies sem cabeçalhos de identidade e preserva vários Set-Cookie', async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', 'a=1; HttpOnly; Path=/');
    headers.append('set-cookie', 'b=2; HttpOnly; Path=/');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { headers }));
    const response = await proxyApi(
      new Request(web + '/api/auth/get-session', {
        headers: {
          cookie: 'session=opaque',
          'x-user-id': 'attacker',
          'x-forwarded-host': 'evil.test',
        },
      }),
      origin,
      fetcher,
    );
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(String(fetcher.mock.calls[0][0])).toBe(origin.origin + '/api/auth/get-session');
    const sent = fetcher.mock.calls[0][1]!.headers as Headers;
    expect(sent.get('cookie')).toBe('session=opaque');
    expect(sent.has('x-user-id')).toBe(false);
    expect(sent.has('x-forwarded-host')).toBe(false);
  });
  it('recusa escrita cross-origin e sem Origin antes de acessar API', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const source of [undefined, 'https://evil.test']) {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (source) headers.set('origin', source);
      const result = await proxyApi(
        new Request(web + '/api/projects', { method: 'POST', headers, body: '{}' }),
        origin,
        fetcher,
      );
      expect(result.status).toBe(403);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('limita rotas, corpo e redirecionamentos', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://evil.test' } }),
      );
    expect((await proxyApi(new Request(web + '/api/arbitrary'), origin, fetcher)).status).toBe(404);
    expect(
      (
        await proxyApi(
          new Request(web + '/api/projects', {
            method: 'POST',
            headers: { origin: web, 'content-type': 'application/json' },
            body: ' '.repeat(2 * 1024 * 1024 + 1),
          }),
          origin,
          fetcher,
        )
      ).status,
    ).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await proxyApi(new Request(web + '/api/auth/reset-password/token'), origin, fetcher)).status,
    ).toBe(503);
  });
  it('descarta location externo em resposta 200 (sign-in social) sem falhar', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { url: 'https://accounts.google.com/o/oauth2/v2/auth', redirect: true },
          { headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth' } },
        ),
      );
    const response = await proxyApi(
      new Request(web + '/api/auth/sign-in/social', {
        method: 'POST',
        headers: { origin: web, 'content-type': 'application/json' },
        body: '{"provider":"google"}',
      }),
      origin,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
    expect(await response.json()).toMatchObject({ redirect: true });
  });
  it('libera só as rotas de compartilhamento previstas', async () => {
    const id = '1a2b3c4d-1111-4111-8111-111111111111';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    for (const path of [
      `/api/projects/${id}/share-links`,
      `/api/projects/${id}/share-links/${id}`,
      '/api/shared/view',
      '/api/shared/redeem',
    ]) {
      const result = await proxyApi(
        new Request(web + path, {
          method: 'POST',
          headers: { origin: web, 'content-type': 'application/json' },
          body: '{}',
        }),
        origin,
        fetcher,
      );
      expect(result.status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const path of [
      `/api/projects/${id}/share-links/${id}/extra`,
      `/api/projects/${id}/share-link`,
      '/api/shared/view/token',
      '/api/shared/redeem/token',
      '/api/shared',
    ])
      expect((await proxyApi(new Request(web + path), origin, fetcher)).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('preserva conflitos e falhas sem cache', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'revision_conflict' }, { status: 409 }));
    const response = await proxyApi(
      new Request(web + '/api/projects', {
        method: 'POST',
        headers: { origin: web, 'content-type': 'application/json' },
        body: '{}',
      }),
      origin,
      fetcher,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'revision_conflict' });
  });
});
