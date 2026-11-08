import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { ApiConfig } from './config.js';

const config: ApiConfig = {
  port: 3001,
  webOrigin: 'http://localhost:5173',
  version: '0.1.0',
  production: false,
};

describe('API base', () => {
  it('reports health without requiring the database', async () => {
    const app = createApp(config, { checkReadiness: vi.fn() });
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'enlace-api',
      version: '0.1.0',
    });
  });

  it('reports ready when the injected database check succeeds', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const response = await app.request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ready',
      service: 'enlace-api',
      version: '0.1.0',
    });
  });

  it.each([new Error('secret database password'), new Error('offline')])(
    'hides readiness failure detail',
    async (error) => {
      const app = createApp(config, {
        checkReadiness: async () => {
          throw error;
        },
      });
      const response = await app.request('/ready');
      expect(response.status).toBe(503);
      const payload = await response.json();
      expect(payload).toEqual({ status: 'not_ready', service: 'enlace-api', version: '0.1.0' });
      expect(JSON.stringify(payload)).not.toContain(error.message);
    },
  );

  it('reports not ready when no database is configured', async () => {
    const app = createApp(config, {
      checkReadiness: async () => {
        throw new Error('database_unavailable');
      },
    });
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'not_ready',
      service: 'enlace-api',
      version: '0.1.0',
    });
  });

  it('returns JSON 404 for unknown routes and does not expose product routes', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const response = await app.request('/projects');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('rejects request bodies larger than 2 MiB without exposing implementation details', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const response = await app.request('/future-route', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(2 * 1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
  });

  it('allows only the configured browser origin', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const allowed = await app.request('/health', { headers: { origin: config.webOrigin } });
    const denied = await app.request('/health', {
      headers: { origin: 'https://attacker.example' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(config.webOrigin);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('keeps auth unavailable explicit when the secret is absent', async () => {
    const app = createApp(config, { checkReadiness: async () => undefined });
    const auth = await app.request('/api/auth/sign-in/email', { method: 'POST' });
    expect(auth.status).toBe(503);
    expect(await auth.json()).toEqual({ error: 'auth_unavailable' });
    const capabilities = await app.request('/api/auth-capabilities');
    expect(await capabilities.json()).toEqual({ passwordReset: false });
  });

  it('requires exact same origin for project mutations and auth for reads', async () => {
    const store = {
      list: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    const app = createApp(config, {
      checkReadiness: async () => undefined,
      projectStore: store,
      auth: { handler: vi.fn(), api: { getSession: vi.fn(async () => null) } },
    });
    const missingOrigin = await app.request('/api/projects', { method: 'POST', body: '{}' });
    expect(missingOrigin.status).toBe(403);
    const unauthenticated = await app.request('/api/projects', {
      headers: { origin: config.webOrigin },
    });
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: 'unauthenticated' });
    expect(store.list).not.toHaveBeenCalled();
  });

  it('returns explicit 503 for password reset without SMTP', async () => {
    const app = createApp(config, {
      checkReadiness: async () => undefined,
      auth: { handler: vi.fn(), api: { getSession: vi.fn(async () => null) } },
    });
    const response = await app.request('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.webOrigin },
      body: '{}',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'password_reset_unavailable' });
  });

  it('rejects cross-origin and fetch-metadata cross-site auth mutations before dispatch', async () => {
    const handler = vi.fn(async () => new Response('{}', { status: 200 }));
    const app = createApp(config, {
      checkReadiness: async () => undefined,
      auth: { handler, api: { getSession: vi.fn(async () => null) } },
    });
    const badOrigin = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: '{}',
    });
    expect(badOrigin.status).toBe(403);
    const noOriginCrossSite = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(noOriginCrossSite.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('marks direct API responses uncacheable and requires JSON for writes', async () => {
    const store = {
      list: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    const app = createApp(config, {
      checkReadiness: async () => undefined,
      projectStore: store,
      auth: { handler: vi.fn(), api: { getSession: vi.fn(async () => ({ user: { id: 'u1' } })) } },
    });
    const read = await app.request('/api/projects');
    expect(read.headers.get('cache-control')).toBe('no-store');
    const wrongType = await app.request('/api/projects', {
      method: 'POST',
      headers: { origin: config.webOrigin, 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(wrongType.status).toBe(400);
    expect(await wrongType.json()).toEqual({ error: 'invalid_request' });
    expect(store.create).not.toHaveBeenCalled();
  });
});
