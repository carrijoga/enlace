import {
  createShareLinkRequestSchema,
  MAX_ACTIVE_SHARE_LINKS,
  shareLinkSchema,
  type CreateShareLinkRequest,
  type ShareLink,
  type SharedView,
  type ShareLinkMode,
} from '@enlace/contracts';
import { toSharedView } from '@enlace/domain';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createShareToken, verifyShareToken } from './share-token.js';
import { ProjectStoreError, readSnapshot, transaction } from './store.js';

type LinkRow = {
  id: string;
  label: string;
  mode: ShareLinkMode;
  created_at: Date;
  expires_at: Date | null;
};
const ACTIVE = '(l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > now()))';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkOwner(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255)
    throw new ProjectStoreError(400, 'invalid_request');
}
function checkUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new ProjectStoreError(400, 'invalid_request');
}
/** Toda operação do dono começa provando a posse do projeto na mesma transação. */
async function ownedProject(client: PoolClient, ownerId: string, projectId: string, lock = false) {
  const found = await client.query(
    `SELECT id FROM projects WHERE id=$1 AND owner_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [projectId, ownerId],
  );
  if (!found.rowCount) throw new ProjectStoreError(404, 'not_found');
}

export function createShareLinkStore(pool: Pool, secret: string) {
  const toLink = (row: LinkRow): ShareLink =>
    shareLinkSchema.parse({
      id: row.id,
      label: row.label,
      mode: row.mode,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at?.toISOString() ?? null,
      token: createShareToken(secret, row.id),
    });

  return {
    /** Só o HMAC, sem banco: usado para limitar leituras por link antes da consulta. */
    linkIdOf(token: unknown): string | null {
      return verifyShareToken(secret, token);
    },

    async list(ownerId: string, projectId: string): Promise<ShareLink[]> {
      checkOwner(ownerId);
      checkUuid(projectId);
      return transaction(pool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await ownedProject(client, ownerId, projectId);
        const rows = await client.query<LinkRow>(
          `SELECT l.id,l.label,l.mode,l.created_at,l.expires_at FROM project_share_links l
           WHERE l.project_id=$1 AND ${ACTIVE} ORDER BY l.created_at,l.id`,
          [projectId],
        );
        return rows.rows.map(toLink);
      });
    },

    async create(
      ownerId: string,
      projectId: string,
      input: CreateShareLinkRequest,
    ): Promise<ShareLink> {
      checkOwner(ownerId);
      checkUuid(projectId);
      const parsed = createShareLinkRequestSchema.safeParse(input);
      if (!parsed.success) throw new ProjectStoreError(400, 'invalid_request');
      const { label, mode, expiresInDays } = parsed.data;
      return transaction(pool, async (client) => {
        // O bloqueio da linha do projeto serializa criações simultâneas e protege o limite.
        await ownedProject(client, ownerId, projectId, true);
        const active = await client.query<{ count: string }>(
          `SELECT count(*) FROM project_share_links l WHERE l.project_id=$1 AND ${ACTIVE}`,
          [projectId],
        );
        if (Number(active.rows[0]!.count) >= MAX_ACTIVE_SHARE_LINKS)
          throw new ProjectStoreError(409, 'share_link_limit');
        const inserted = await client.query<LinkRow>(
          `INSERT INTO project_share_links (id,project_id,label,mode,expires_at)
           VALUES ($1,$2,$3,$4,CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END)
           RETURNING id,label,mode,created_at,expires_at`,
          [randomUUID(), projectId, label, mode, expiresInDays],
        );
        return toLink(inserted.rows[0]!);
      });
    },

    /** Idempotente: desativar de novo um link já desativado não é erro. */
    async revoke(ownerId: string, projectId: string, linkId: string): Promise<void> {
      checkOwner(ownerId);
      checkUuid(projectId);
      checkUuid(linkId);
      await transaction(pool, async (client) => {
        await ownedProject(client, ownerId, projectId);
        const found = await client.query(
          `UPDATE project_share_links SET revoked_at=COALESCE(revoked_at, now())
           WHERE id=$1 AND project_id=$2 RETURNING id`,
          [linkId, projectId],
        );
        if (!found.rowCount) throw new ProjectStoreError(404, 'not_found');
      });
    },

    /**
     * Leitura pública. Token inválido, link inexistente, desativado, vencido ou de projeto
     * excluído dão o mesmo `not_found`. Tokens forjados param no HMAC, sem consultar o banco.
     */
    async view(token: unknown): Promise<SharedView> {
      const linkId = verifyShareToken(secret, token);
      if (!linkId) throw new ProjectStoreError(404, 'not_found');
      return transaction(pool, async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const found = await client.query<{
          project_id: string;
          owner_id: string;
          mode: ShareLinkMode;
        }>(
          `SELECT l.project_id,p.owner_id,l.mode FROM project_share_links l
           JOIN projects p ON p.id=l.project_id WHERE l.id=$1 AND ${ACTIVE}`,
          [linkId],
        );
        const link = found.rows[0];
        if (!link) throw new ProjectStoreError(404, 'not_found');
        const snapshot = await readSnapshot(client, link.owner_id, link.project_id);
        if (!snapshot) throw new ProjectStoreError(404, 'not_found');
        return toSharedView(snapshot.project, link.mode);
      });
    },
  };
}

export type ShareLinkStore = ReturnType<typeof createShareLinkStore>;

/**
 * Teto de leituras por link e por instância, em janela fixa. A API só vê o IP do proxy da
 * Vercel, então não há limite por cliente (mesma limitação da autenticação, ver
 * docs/desenvolvimento.md). Guarda apenas linkIds e contadores, nunca dados de quem acessa.
 */
export function createViewLimiter(maxPerWindow = 600, windowMs = 60_000, maxKeys = 10_000) {
  let windowStart = Number.NEGATIVE_INFINITY;
  const counts = new Map<string, number>();
  return {
    /** Devolve os segundos até liberar, ou 0 se a leitura pode seguir. */
    hit(key: string, now = Date.now()): number {
      if (now - windowStart >= windowMs) {
        windowStart = now;
        counts.clear();
      }
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
      const count = counts.get(key) ?? 0;
      if (count >= maxPerWindow) return retryAfter;
      if (count === 0 && counts.size >= maxKeys) return retryAfter;
      counts.set(key, count + 1);
      return 0;
    },
  };
}
