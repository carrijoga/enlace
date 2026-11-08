import {
  createProjectRequestSchema,
  deleteProjectRequestSchema,
  healthResponseSchema,
  readinessResponseSchema,
  saveProjectRequestSchema,
  type CreateProjectRequest,
  type SaveProjectRequest,
} from '@enlace/contracts';
import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiConfig } from './config.js';
import { ProjectStoreError } from './projects/store.js';

export interface AppDependencies {
  checkReadiness: () => Promise<void>;
  auth?:
    | {
        handler: (request: Request) => Promise<Response>;
        api: {
          getSession: (options: { headers: Headers }) => Promise<{ user: { id: string } } | null>;
        };
      }
    | undefined;
  projectStore?: ProjectStore | undefined;
}

export interface ProjectStore {
  list(ownerId: string): Promise<unknown[]>;
  get(ownerId: string, id: string): Promise<unknown>;
  create(ownerId: string, input: CreateProjectRequest): Promise<unknown>;
  save(ownerId: string, id: string, input: SaveProjectRequest): Promise<unknown>;
  delete(ownerId: string, id: string, expectedRevision: number): Promise<void>;
}

export function createApp(config: ApiConfig, dependencies: AppDependencies) {
  const app = new Hono();
  app.use('*', secureHeaders());
  app.use('*', bodyLimit({ maxSize: 2 * 1024 * 1024 }));
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use(
    '*',
    cors({
      origin: (origin) => (origin === config.webOrigin ? origin : undefined),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.get('/health', (c) =>
    c.json(
      healthResponseSchema.parse({ status: 'ok', service: 'enlace-api', version: config.version }),
      200,
    ),
  );
  app.get('/ready', async (c) => {
    try {
      await dependencies.checkReadiness();
      return c.json(
        readinessResponseSchema.parse({
          status: 'ready',
          service: 'enlace-api',
          version: config.version,
        }),
        200,
      );
    } catch {
      return c.json(
        readinessResponseSchema.parse({
          status: 'not_ready',
          service: 'enlace-api',
          version: config.version,
        }),
        503,
      );
    }
  });
  app.get('/api/auth-capabilities', (c) =>
    c.json({
      passwordReset: Boolean(
        dependencies.auth && config.smtpHost && config.smtpPort && config.smtpFrom,
      ),
    }),
  );
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    if (!dependencies.auth) return c.json({ error: 'auth_unavailable' }, 503);
    if (c.req.method === 'POST') {
      const origin = c.req.header('origin');
      if (origin !== config.webOrigin) {
        return c.json({ error: 'invalid_origin' }, 403);
      }
      if (!hasJsonContentType(c)) return c.json({ error: 'invalid_request' }, 400);
    }
    if (
      c.req.method === 'POST' &&
      c.req.path === '/api/auth/request-password-reset' &&
      !(config.smtpHost && config.smtpPort && config.smtpFrom)
    ) {
      return c.json({ error: 'password_reset_unavailable' }, 503);
    }
    return dependencies.auth.handler(c.req.raw);
  });

  async function requireSession(c: Context): Promise<string | Response> {
    if (!dependencies.auth) {
      return c.json({ error: 'auth_unavailable' }, 503);
    }
    const session = await dependencies.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'unauthenticated' }, 401);
    return session.user.id;
  }
  const writable = async (c: Context): Promise<Response | null> => {
    if (c.req.header('origin') !== config.webOrigin) {
      return c.json({ error: 'invalid_origin' }, 403);
    }
    if (!hasJsonContentType(c)) return c.json({ error: 'invalid_request' }, 400);
    if (!dependencies.projectStore) return c.json({ error: 'projects_unavailable' }, 503);
    return null;
  };
  app.get('/api/projects', async (c) => {
    if (!dependencies.projectStore) return c.json({ error: 'projects_unavailable' }, 503);
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    return c.json({ projects: await dependencies.projectStore.list(owner) });
  });
  app.post('/api/projects', async (c) => {
    const blocked = await writable(c);
    if (blocked) return blocked;
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      const input = createProjectRequestSchema.parse(await c.req.json());
      return c.json(await dependencies.projectStore!.create(owner, input), 201);
    } catch (error) {
      return projectError(c, error);
    }
  });
  app.get('/api/projects/:id', async (c) => {
    if (!dependencies.projectStore) return c.json({ error: 'projects_unavailable' }, 503);
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      return c.json(await dependencies.projectStore.get(owner, c.req.param('id')));
    } catch (error) {
      return projectError(c, error);
    }
  });
  app.put('/api/projects/:id', async (c) => {
    const blocked = await writable(c);
    if (blocked) return blocked;
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      const input = saveProjectRequestSchema.parse(await c.req.json());
      return c.json(await dependencies.projectStore!.save(owner, c.req.param('id'), input));
    } catch (error) {
      return projectError(c, error);
    }
  });
  app.delete('/api/projects/:id', async (c) => {
    const blocked = await writable(c);
    if (blocked) return blocked;
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      const body = deleteProjectRequestSchema.parse(await c.req.json());
      await dependencies.projectStore!.delete(owner, c.req.param('id'), body.expectedRevision);
      return c.body(null, 204);
    } catch (error) {
      return projectError(c, error);
    }
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 413)
      return c.json({ error: 'payload_too_large' }, 413);
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}

function hasJsonContentType(c: Context): boolean {
  return (
    c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
  );
}

function projectError(c: Context, error: unknown) {
  if (error instanceof ProjectStoreError) return c.json({ error: error.code }, error.status);
  if (
    error instanceof SyntaxError ||
    (typeof error === 'object' && error !== null && 'issues' in error)
  ) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  return c.json({ error: 'internal_error' }, 500);
}
