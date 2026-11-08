import { describe, expect, it, vi } from 'vitest';
import { fetchApiHealth, resolveApiOrigin } from './api-health';

describe('transporte de healthcheck', () => {
  it('usa a origem configurada e valida o contrato da API', async () => {
    const payload = { status: 'ok', service: 'enlace-api', version: '0.1.0' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    expect(await fetchApiHealth(new URL('https://api.example.test'), fetcher)).toEqual(payload);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.example.test/health');
  });
  it('recusa respostas com outro formato', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    await expect(fetchApiHealth(new URL('http://localhost:3001'), fetcher)).rejects.toThrow();
  });
  it('recusa destino sem configuração em produção e origem com credenciais', () => {
    expect(() => resolveApiOrigin(undefined, true)).toThrow();
    expect(() => resolveApiOrigin('https://user:secret@api.example.test', true)).toThrow();
    expect(() => resolveApiOrigin('http://api.example.test', true)).toThrow();
    expect(resolveApiOrigin(undefined, false).origin).toBe('http://localhost:3001');
  });
});
