import {
  ceremonyProjectSchema,
  createShareLinkRequestSchema,
  MAX_ACTIVE_SHARE_LINKS,
  redeemShareLinkRequestSchema,
  shareLinkSchema,
  type CreateShareLinkRequest,
  type RedeemShareLinkRequest,
  type ShareLink,
  type SharedView,
  type ShareLinkMode,
} from '@enlace/contracts';
import { toSharedView } from '@enlace/domain';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createShareToken, verifyShareToken } from './share-token.js';
import { insertProjectCopy, ProjectStoreError, readSnapshot, transaction } from './store.js';

type LinkRow = {
  id: string;
  label: string;
  mode: ShareLinkMode;
  created_at: Date;
  expires_at: Date | null;
};
const ACTIVE =
  '(l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > statement_timestamp()))';
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
        await ownedProject(client, ownerId, projectId, true);
        const found = await client.query(
          `UPDATE project_share_links SET revoked_at=COALESCE(revoked_at, now())
           WHERE id=$1 AND project_id=$2 RETURNING id`,
          [linkId, projectId],
        );
        if (!found.rowCount) throw new ProjectStoreError(404, 'not_found');
      });
    },

    async redeem(userId: string, input: RedeemShareLinkRequest): Promise<{ projectId: string }> {
      checkOwner(userId);
      const parsed = redeemShareLinkRequestSchema.safeParse(input);
      if (!parsed.success) throw new ProjectStoreError(400, 'invalid_request');
      const { token, mode } = parsed.data;
      const linkId = verifyShareToken(secret, token);
      if (!linkId) throw new ProjectStoreError(404, 'not_found');

      return transaction(pool, async (client) => {
        const locked = await client.query<{ id: string; owner_id: string }>(
          `SELECT p.id,p.owner_id FROM projects p
           JOIN project_share_links l ON l.project_id=p.id
           WHERE l.id=$1 AND l.mode=$2 AND ${ACTIVE} FOR UPDATE OF p`,
          [linkId, mode],
        );
        const source = locked.rows[0];
        if (!source) throw new ProjectStoreError(404, 'not_found');

        // Revalida depois do bloqueio para observar uma desativação ou expiração durante a espera.
        const active = await client.query(
          `SELECT l.id FROM project_share_links l
           WHERE l.id=$1 AND l.mode=$2 AND ${ACTIVE}`,
          [linkId, mode],
        );
        if (!active.rowCount) throw new ProjectStoreError(404, 'not_found');

        if (mode === 'edit') {
          if (userId !== source.owner_id) {
            await client.query(
              `INSERT INTO project_link_editors (link_id,user_id)
               VALUES ($1,$2) ON CONFLICT (link_id,user_id) DO NOTHING`,
              [linkId, userId],
            );
          }
          return { projectId: source.id };
        }

        const receipt = await client.query<{ project_id: string }>(
          'SELECT project_id FROM project_link_clone_receipts WHERE link_id=$1 AND user_id=$2',
          [linkId, userId],
        );
        if (receipt.rows[0]) return { projectId: receipt.rows[0].project_id };

        const snapshot = await readSnapshot(client, source.owner_id, source.id);
        if (!snapshot) throw new ProjectStoreError(404, 'not_found');
        const maxLength = ceremonyProjectSchema.shape.title.maxLength ?? 120;
        const title = `Cópia de ${snapshot.project.title.trim()}`
          .slice(0, maxLength)
          .replace(/[\uD800-\uDBFF]$/u, '')
          .trimEnd();
        const projectId = randomUUID();
        await insertProjectCopy(client, userId, projectId, { ...snapshot.project, title });
        await client.query(
          `INSERT INTO project_link_clone_receipts (link_id,user_id,project_id) VALUES ($1,$2,$3)`,
          [linkId, userId, projectId],
        );
        return { projectId };
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
          mode: SharedView['mode'];
        }>(
          `SELECT l.project_id,p.owner_id,l.mode FROM project_share_links l
           JOIN projects p ON p.id=l.project_id WHERE l.id=$1 AND l.mode IN ('names','plan') AND ${ACTIVE}`,
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
