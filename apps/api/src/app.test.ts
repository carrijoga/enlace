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
});
