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
