import { healthResponseSchema, readinessResponseSchema } from '@enlace/contracts';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiConfig } from './config.js';

export interface AppDependencies {
  checkReadiness: () => Promise<void>;
}

export function createApp(config: ApiConfig, dependencies: AppDependencies) {
  const app = new Hono();
  app.use('*', secureHeaders());
  app.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024 }));
  app.use(
    '*',
    cors({
      origin: (origin) => (origin === config.webOrigin ? origin : undefined),
      allowMethods: ['GET', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.get('/health', (c) => {
    const response = healthResponseSchema.parse({
      status: 'ok',
      service: 'enlace-api',
      version: config.version,
    });
    return c.json(response, 200);
  });

  app.get('/ready', async (c) => {
    try {
      await dependencies.checkReadiness();
      const response = readinessResponseSchema.parse({
        status: 'ready',
        service: 'enlace-api',
        version: config.version,
      });
      return c.json(response, 200);
    } catch {
      const response = readinessResponseSchema.parse({
        status: 'not_ready',
        service: 'enlace-api',
        version: config.version,
      });
      return c.json(response, 503);
    }
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 413) {
      return c.json({ error: 'payload_too_large' }, 413);
    }
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
