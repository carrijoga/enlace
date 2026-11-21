import {
  createProjectRequestSchema,
  createShareLinkRequestSchema,
  redeemShareLinkRequestSchema,
  revokeShareLinkRequestSchema,
  sharedViewRequestSchema,
  deleteProjectRequestSchema,
  healthResponseSchema,
  readinessResponseSchema,
  saveProjectRequestSchema,
  type CreateProjectRequest,
  type CreateShareLinkRequest,
  type RedeemShareLinkRequest,
  type SaveProjectRequest,
} from '@enlace/contracts';
import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiConfig } from './config.js';
import { createViewLimiter } from './projects/share-links.js';
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
  /** Ausente sem banco ou sem `SHARE_LINK_SECRET`: as rotas de compartilhamento respondem 503. */
  shareLinks?: ShareLinkStore | undefined;
}

export interface ShareLinkStore {
  linkIdOf(token: unknown): string | null;
  list(ownerId: string, projectId: string): Promise<unknown[]>;
  create(ownerId: string, projectId: string, input: CreateShareLinkRequest): Promise<unknown>;
  revoke(ownerId: string, projectId: string, linkId: string): Promise<void>;
  view(token: unknown): Promise<unknown>;
  redeem(userId: string, input: RedeemShareLinkRequest): Promise<{ projectId: string }>;
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
  app.use('*', async (c, next) => {
    const startedAt = performance.now();
    await next();
    const route = c.req.routePath || '/unmatched';
    // Route templates only: never log identifiers, query strings, headers, or request bodies.
    console.info(
      JSON.stringify({
        event: 'http_request',
        method: c.req.method,
        route,
        status: c.res.status,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      }),
    );
  });
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
  /** Toda requisição que altera dados vem da origem exata da web e em JSON. */
  const sameOriginJson = (c: Context): Response | null => {
    if (c.req.header('origin') !== config.webOrigin) {
      return c.json({ error: 'invalid_origin' }, 403);
    }
    if (!hasJsonContentType(c)) return c.json({ error: 'invalid_request' }, 400);
    return null;
  };
  const writable = async (c: Context): Promise<Response | null> => {
    const blocked = sameOriginJson(c);
    if (blocked) return blocked;
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

  // Links de visualização (ADR-0014). Gerenciamento: só o dono, com sessão e origem.
  const sharingUnavailable = (c: Context) => c.json({ error: 'sharing_unavailable' }, 503);
  app.get('/api/projects/:id/share-links', async (c) => {
    if (!dependencies.shareLinks) return sharingUnavailable(c);
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      return c.json({ links: await dependencies.shareLinks.list(owner, c.req.param('id')) });
    } catch (error) {
      return projectError(c, error);
    }
  });
  app.post('/api/projects/:id/share-links', async (c) => {
    const blocked = sameOriginJson(c);
    if (blocked) return blocked;
    if (!dependencies.shareLinks) return sharingUnavailable(c);
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      const input = createShareLinkRequestSchema.parse(await c.req.json());
      return c.json(await dependencies.shareLinks.create(owner, c.req.param('id'), input), 201);
    } catch (error) {
      return projectError(c, error);
    }
  });
  app.delete('/api/projects/:id/share-links/:linkId', async (c) => {
    const blocked = sameOriginJson(c);
    if (blocked) return blocked;
    if (!dependencies.shareLinks) return sharingUnavailable(c);
    const owner = await requireSession(c);
    if (owner instanceof Response) return owner;
    try {
      revokeShareLinkRequestSchema.parse(await c.req.json());
      await dependencies.shareLinks.revoke(owner, c.req.param('id'), c.req.param('linkId'));
      return c.body(null, 204);
    } catch (error) {
      return projectError(c, error);
    }
  });

  app.post('/api/shared/redeem', async (c) => {
    const blocked = sameOriginJson(c);
    if (blocked) return blocked;
    if (!dependencies.shareLinks) return sharingUnavailable(c);
    const userId = await requireSession(c);
    if (userId instanceof Response) return userId;
    try {
      const input = redeemShareLinkRequestSchema.parse(await c.req.json());
      return c.json(await dependencies.shareLinks.redeem(userId, input));
    } catch (error) {
      return projectError(c, error);
    }
  });

  // Leitura pública: sem sessão, só a projeção. O token vem no corpo, nunca na URL.
  const viewLimiter = createViewLimiter();
  app.post('/api/shared/view', async (c) => {
    c.header('X-Robots-Tag', 'noindex, nofollow');
    const blocked = sameOriginJson(c);
    if (blocked) return blocked;
    if (!dependencies.shareLinks) return sharingUnavailable(c);
    try {
      const { token } = sharedViewRequestSchema.parse(await c.req.json());
      const linkId = dependencies.shareLinks.linkIdOf(token);
      if (!linkId) return c.json({ error: 'not_found' }, 404);
      const retryAfter = viewLimiter.hit(linkId);
      if (retryAfter) {
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: 'rate_limited' }, 429);
      }
      return c.json(await dependencies.shareLinks.view(token));
    } catch (error) {
      // Token malformado responde igual a um link inexistente.
      if (typeof error === 'object' && error !== null && 'issues' in error)
        return c.json({ error: 'not_found' }, 404);
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
