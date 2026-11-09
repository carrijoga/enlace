import { createHash } from 'node:crypto';
import type {
  CeremonyProject,
  CreateProjectRequest,
  ProjectSnapshot,
  ProjectSummary,
  ProjectWriteResponse,
  SaveProjectRequest,
} from '@enlace/contracts';
import { ceremonyProjectSchema } from '@enlace/contracts';
import type { Pool, PoolClient } from 'pg';

export class ProjectStoreError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code:
      'invalid_request' | 'not_found' | 'revision_conflict' | 'operation_reused',
  ) {
    super(code);
    this.name = 'ProjectStoreError';
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function failInvalid(): never {
  throw new ProjectStoreError(400, 'invalid_request');
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
function owner(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) failInvalid();
}
function projectValue(value: unknown): CeremonyProject {
  const result = ceremonyProjectSchema.safeParse(value);
  if (!result.success) failInvalid();
  return result.data;
}
function checkUuid(value: unknown): asserts value is string {
  if (!uuid(value)) failInvalid();
}
function checkRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) failInvalid();
}

async function replaceAggregate(client: PoolClient, projectId: string, project: CeremonyProject) {
  await client.query('DELETE FROM seat_assignments WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM guests WHERE project_id = $1', [projectId]);
  await client.query(
    `INSERT INTO guests (id,project_id,name,category,note,sort_order)
     SELECT guest.id,$1,guest.name,guest.category,guest.note,guest.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS guest(id uuid,name text,category text,note text,sort_order integer)`,
    [
      projectId,
      JSON.stringify(
        project.guests.map((guest, sortOrder) => ({ ...guest, sort_order: sortOrder })),
      ),
    ],
  );
  await client.query(
    `INSERT INTO seat_assignments (project_id,seat_id,guest_id)
     SELECT $1,assignment.seat_id,assignment.guest_id
     FROM jsonb_to_recordset($2::jsonb) AS assignment(seat_id uuid,guest_id uuid)`,
    [
      projectId,
      JSON.stringify(
        project.assignments.map(({ seatId, guestId }) => ({ seat_id: seatId, guest_id: guestId })),
      ),
    ],
  );
  const layout = project.layout;
  await client.query(
    `UPDATE projects SET title=$2, couple_first=$3, couple_second=$4, wedding_date=$5,
     layout_schema_version=1, layout=$6::jsonb WHERE id=$1`,
    [
      projectId,
      project.title,
      project.couple.first,
      project.couple.second,
      project.weddingDate,
      JSON.stringify(layout),
    ],
  );
}

async function readSnapshot(
  client: PoolClient,
  ownerId: string,
  id: string,
): Promise<ProjectSnapshot | null> {
  const found = await client.query<{
    id: string;
    title: string;
    couple_first: string;
    couple_second: string;
    wedding_date: string | null;
    layout: CeremonyProject['layout'];
    revision: number;
    updated_at: Date;
  }>(
    'SELECT id,title,couple_first,couple_second,wedding_date::text,layout,revision,updated_at FROM projects WHERE id=$1 AND owner_id=$2',
    [id, ownerId],
  );
  const row = found.rows[0];
  if (!row) return null;
  const [guestRows, assignmentRows] = await Promise.all([
    client.query<{
      id: string;
      name: string;
      category: CeremonyProject['guests'][number]['category'];
      note: string;
    }>('SELECT id,name,category,note FROM guests WHERE project_id=$1 ORDER BY sort_order,id', [id]),
    client.query<{ seat_id: string; guest_id: string }>(
      'SELECT seat_id,guest_id FROM seat_assignments WHERE project_id=$1 ORDER BY seat_id',
      [id],
    ),
  ]);
  return {
    id: row.id,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
    project: ceremonyProjectSchema.parse({
      title: row.title,
      couple: { first: row.couple_first, second: row.couple_second },
      weddingDate: row.wedding_date,
      layout: row.layout,
      guests: guestRows.rows,
      assignments: assignmentRows.rows.map(({ seat_id, guest_id }) => ({
        seatId: seat_id,
        guestId: guest_id,
      })),
    }),
  };
}

export function createProjectStore(pool: Pool) {
  async function tx<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      // A vanished auth principal maps to an invalid request, not a leaked DB error.
      if ((error as { code?: string })?.code === '23503')
        throw new ProjectStoreError(400, 'invalid_request');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async list(ownerId: string): Promise<ProjectSummary[]> {
      owner(ownerId);
      const result = await pool.query<{
        id: string;
        title: string;
        revision: number;
        updated_at: Date;
      }>(
        'SELECT id,title,revision,updated_at FROM projects WHERE owner_id=$1 ORDER BY updated_at DESC,id',
        [ownerId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        revision: row.revision,
        updatedAt: row.updated_at.toISOString(),
      }));
    },

    async get(ownerId: string, id: string): Promise<ProjectSnapshot> {
      owner(ownerId);
      checkUuid(id);
      return tx(async (client) => {
        // REPEATABLE READ keeps the multi-query snapshot coherent.
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const snapshot = await readSnapshot(client, ownerId, id);
        if (!snapshot) throw new ProjectStoreError(404, 'not_found');
        return snapshot;
      });
    },

    async create(ownerId: string, input: CreateProjectRequest): Promise<ProjectSnapshot> {
      owner(ownerId);
      checkUuid(input?.id);
      checkUuid(input?.operationId);
      const project = projectValue(input.project);
      const requestHash = hash({ id: input.id, project });
      return tx(async (client) => {
        // Insert-on-conflict serializes concurrent retries on the client-generated project ID.
        const inserted = await client.query(
          `INSERT INTO projects (id,owner_id,title,couple_first,couple_second,wedding_date,layout,revision)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,1) ON CONFLICT (id) DO NOTHING`,
          [
            input.id,
            ownerId,
            project.title,
            project.couple.first,
            project.couple.second,
            project.weddingDate,
            JSON.stringify(project.layout),
          ],
        );
        const locked = await client.query(
          'SELECT id,owner_id,revision FROM projects WHERE id=$1 FOR UPDATE',
          [input.id],
        );
        const row = locked.rows[0];
        if (!row || row.owner_id !== ownerId) throw new ProjectStoreError(404, 'not_found');
        const receipt = await client.query<{ request_hash: string; result_revision: number }>(
          'SELECT request_hash,result_revision FROM project_write_receipts WHERE project_id=$1 AND actor_id=$2 AND operation_id=$3',
          [input.id, ownerId, input.operationId],
        );
        if (receipt.rowCount) {
          if (receipt.rows[0]!.request_hash !== requestHash)
            throw new ProjectStoreError(409, 'operation_reused');
          const snapshot = await readSnapshot(client, ownerId, input.id);
          if (!snapshot) throw new ProjectStoreError(404, 'not_found');
          return snapshot;
        }
        if (!inserted.rowCount) throw new ProjectStoreError(409, 'operation_reused');
        await replaceAggregate(client, input.id, project);
        await client.query(
          'INSERT INTO project_write_receipts (project_id,actor_id,operation_id,request_hash,result_revision) VALUES ($1,$2,$3,$4,1)',
          [input.id, ownerId, input.operationId, requestHash],
        );
        const snapshot = await readSnapshot(client, ownerId, input.id);
        if (!snapshot) throw new ProjectStoreError(404, 'not_found');
        return snapshot;
      });
    },

    async save(
      ownerId: string,
      id: string,
      input: SaveProjectRequest,
    ): Promise<ProjectWriteResponse> {
      owner(ownerId);
      checkUuid(id);
      checkUuid(input?.operationId);
      checkRevision(input?.expectedRevision);
      const project = projectValue(input.project);
      const requestHash = hash({ expectedRevision: input.expectedRevision, project });
      return tx(async (client) => {
        const locked = await client.query<{ revision: number }>(
          'SELECT revision FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE',
          [id, ownerId],
        );
        const current = locked.rows[0];
        if (!current) throw new ProjectStoreError(404, 'not_found');
        const prior = await client.query<{
          request_hash: string;
          result_revision: number;
          created_at: Date;
        }>(
          'SELECT request_hash,result_revision,created_at FROM project_write_receipts WHERE project_id=$1 AND actor_id=$2 AND operation_id=$3',
          [id, ownerId, input.operationId],
        );
        if (prior.rowCount) {
          if (prior.rows[0]!.request_hash !== requestHash)
            throw new ProjectStoreError(409, 'operation_reused');
          return {
            id,
            revision: prior.rows[0]!.result_revision,
            updatedAt: prior.rows[0]!.created_at.toISOString(),
          };
        }
        if (Number(current.revision) !== input.expectedRevision)
          throw new ProjectStoreError(409, 'revision_conflict');
        await replaceAggregate(client, id, project);
        const updated = await client.query<{ revision: number; updated_at: Date }>(
          'UPDATE projects SET revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING revision,updated_at',
          [id, ownerId],
        );
        const revision = updated.rows[0]!.revision;
        await client.query(
          'INSERT INTO project_write_receipts (project_id,actor_id,operation_id,request_hash,result_revision) VALUES ($1,$2,$3,$4,$5)',
          [id, ownerId, input.operationId, requestHash, revision],
        );
        return { id, revision, updatedAt: updated.rows[0]!.updated_at.toISOString() };
      });
    },

    async delete(ownerId: string, id: string, expectedRevision: number): Promise<void> {
      owner(ownerId);
      checkUuid(id);
      checkRevision(expectedRevision);
      await tx(async (client) => {
        const deleted = await client.query(
          'DELETE FROM projects WHERE id=$1 AND owner_id=$2 AND revision=$3 RETURNING id',
          [id, ownerId, expectedRevision],
        );
        if (deleted.rowCount) return;
        const existing = await client.query('SELECT id FROM projects WHERE id=$1 AND owner_id=$2', [
          id,
          ownerId,
        ]);
        if (!existing.rowCount) throw new ProjectStoreError(404, 'not_found');
        throw new ProjectStoreError(409, 'revision_conflict');
      });
    },
  };
}
