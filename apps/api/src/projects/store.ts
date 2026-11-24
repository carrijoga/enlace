import { createHash } from 'node:crypto';
import type {
  CreateProjectRequest,
  Project,
  ProjectSnapshot,
  ProjectSummary,
  ProjectWriteResponse,
  Reception,
  SaveProjectRequest,
} from '@enlace/contracts';
import { projectSchema } from '@enlace/contracts';
import type { Pool, PoolClient } from 'pg';

export class ProjectStoreError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code:
      | 'invalid_request'
      | 'not_found'
      | 'revision_conflict'
      | 'operation_reused'
      | 'share_link_limit',
  ) {
    super(code);
    this.name = 'ProjectStoreError';
  }
}

const EDITABLE_PROJECT_IDS = `
  SELECT l.project_id FROM project_link_editors e
  JOIN project_share_links l ON l.id=e.link_id
  WHERE e.user_id=$1 AND l.mode='edit' AND l.revoked_at IS NULL
  AND (l.expires_at IS NULL OR l.expires_at > statement_timestamp())`;

const SNAPSHOT_FIELDS =
  'id,title,couple_first,couple_second,wedding_date::text,layout,reception,revision,updated_at';

type StoredReception = Omit<Reception, 'tableAssignments'>;

type SnapshotRow = {
  id: string;
  title: string;
  couple_first: string;
  couple_second: string;
  wedding_date: string | null;
  layout: Project['layout'];
  reception: StoredReception | null;
  revision: number;
  updated_at: Date;
};

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
function checkUserId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) failInvalid();
}
function projectValue(value: unknown): Project {
  const result = projectSchema.safeParse(value);
  if (!result.success) failInvalid();
  return result.data;
}
function checkUuid(value: unknown): asserts value is string {
  if (!uuid(value)) failInvalid();
}
function checkRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) failInvalid();
}

function storedReception(project: Project): StoredReception | null {
  return (
    project.reception && {
      room: project.reception.room,
      tables: project.reception.tables,
      items: project.reception.items,
    }
  );
}

async function insertGuestsAndAssignments(client: PoolClient, projectId: string, project: Project) {
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
  // Salão, mesas e elementos ficam no JSONB; as mesas dos convidados, em tabela relacional com
  // chave por convidado. A ordem é preservada porque reduzir cadeiras retira os últimos.
  const tableAssignments = project.reception?.tableAssignments ?? [];
  await client.query(
    `INSERT INTO table_assignments (project_id,guest_id,table_id,sort_order)
     SELECT $1,assignment.guest_id,assignment.table_id,assignment.sort_order
     FROM jsonb_to_recordset($2::jsonb) AS assignment(guest_id uuid,table_id uuid,sort_order integer)`,
    [
      projectId,
      JSON.stringify(
        tableAssignments.map(({ guestId, tableId }, sortOrder) => ({
          guest_id: guestId,
          table_id: tableId,
          sort_order: sortOrder,
        })),
      ),
    ],
  );
}

async function replaceAggregate(client: PoolClient, projectId: string, project: Project) {
  await client.query('DELETE FROM table_assignments WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM seat_assignments WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM guests WHERE project_id = $1', [projectId]);
  await insertGuestsAndAssignments(client, projectId, project);
  const reception = storedReception(project);
  await client.query(
    `UPDATE projects SET title=$2, couple_first=$3, couple_second=$4, wedding_date=$5,
     layout_schema_version=1, layout=$6::jsonb, reception_schema_version=$7, reception=$8::jsonb
     WHERE id=$1`,
    [
      projectId,
      project.title,
      project.couple.first,
      project.couple.second,
      project.weddingDate,
      JSON.stringify(project.layout),
      reception ? 1 : null,
      reception && JSON.stringify(reception),
    ],
  );
}

export async function readSnapshot(
  client: PoolClient,
  ownerId: string,
  id: string,
): Promise<ProjectSnapshot | null> {
  const found = await client.query<SnapshotRow>(
    `SELECT ${SNAPSHOT_FIELDS} FROM projects WHERE id=$1 AND owner_id=$2`,
    [id, ownerId],
  );
  const row = found.rows[0];
  return row ? assembleSnapshot(client, row, 'owner') : null;
}

async function assembleSnapshot(
  client: PoolClient,
  row: SnapshotRow,
  role: ProjectSnapshot['role'],
): Promise<ProjectSnapshot> {
  // Em sequência: uma conexão executa uma consulta por vez, e o pg 9 deixará de enfileirá-las.
  const guestRows = await client.query<{
    id: string;
    name: string;
    category: Project['guests'][number]['category'];
    note: string;
  }>('SELECT id,name,category,note FROM guests WHERE project_id=$1 ORDER BY sort_order,id', [
    row.id,
  ]);
  const assignmentRows = await client.query<{ seat_id: string; guest_id: string }>(
    'SELECT seat_id,guest_id FROM seat_assignments WHERE project_id=$1 ORDER BY seat_id',
    [row.id],
  );
  const tableRows = await client.query<{ table_id: string; guest_id: string }>(
    'SELECT table_id,guest_id FROM table_assignments WHERE project_id=$1 ORDER BY sort_order,guest_id',
    [row.id],
  );
  // Mesa atribuída sem planta da festa só surgiria de gravação fora deste módulo: falha alto.
  if (!row.reception && tableRows.rowCount)
    throw new Error('Atribuições de mesa sem planta da festa');
  return {
    id: row.id,
    role,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
    project: projectSchema.parse({
      title: row.title,
      couple: { first: row.couple_first, second: row.couple_second },
      weddingDate: row.wedding_date,
      layout: row.layout,
      guests: guestRows.rows,
      assignments: assignmentRows.rows.map(({ seat_id, guest_id }) => ({
        seatId: seat_id,
        guestId: guest_id,
      })),
      reception: row.reception && {
        ...row.reception,
        tableAssignments: tableRows.rows.map(({ table_id, guest_id }) => ({
          tableId: table_id,
          guestId: guest_id,
        })),
      },
    }),
  };
}

async function insertProjectRow(
  client: PoolClient,
  ownerId: string,
  id: string,
  project: Project,
): Promise<SnapshotRow | undefined> {
  const reception = storedReception(project);
  const inserted = await client.query<SnapshotRow>(
    `INSERT INTO projects (id,owner_id,title,couple_first,couple_second,wedding_date,layout,reception_schema_version,reception,revision)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,1) ON CONFLICT (id) DO NOTHING
     RETURNING ${SNAPSHOT_FIELDS}`,
    [
      id,
      ownerId,
      project.title,
      project.couple.first,
      project.couple.second,
      project.weddingDate,
      JSON.stringify(project.layout),
      reception ? 1 : null,
      reception && JSON.stringify(reception),
    ],
  );
  return inserted.rows[0];
}

export async function insertProjectCopy(
  client: PoolClient,
  ownerId: string,
  id: string,
  project: Project,
): Promise<ProjectSnapshot> {
  checkUserId(ownerId);
  checkUuid(id);
  const value = projectValue(project);
  const row = await insertProjectRow(client, ownerId, id, value);
  if (!row) throw new ProjectStoreError(409, 'operation_reused');
  await insertGuestsAndAssignments(client, id, value);
  return assembleSnapshot(client, row, 'owner');
}

/** Uma conexão do pool do BEGIN ao COMMIT/ROLLBACK. */
export async function transaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
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

export function createProjectStore(pool: Pool) {
  const tx = <T>(callback: (client: PoolClient) => Promise<T>) => transaction(pool, callback);

  return {
    async list(userId: string): Promise<ProjectSummary[]> {
      checkUserId(userId);
      const result = await pool.query<{
        id: string;
        title: string;
        role: ProjectSummary['role'];
        revision: number;
        updated_at: Date;
      }>(
        `WITH accessible_projects AS (
           SELECT id FROM projects WHERE owner_id=$1
           UNION
           ${EDITABLE_PROJECT_IDS}
         )
         SELECT p.id,p.title,p.revision,p.updated_at,
           CASE WHEN p.owner_id=$1 THEN 'owner' ELSE 'editor' END AS role
         FROM accessible_projects a JOIN projects p ON p.id=a.id
         ORDER BY p.updated_at DESC,p.id`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        role: row.role,
        revision: row.revision,
        updatedAt: row.updated_at.toISOString(),
      }));
    },

    async get(userId: string, id: string): Promise<ProjectSnapshot> {
      checkUserId(userId);
      checkUuid(id);
      return tx(async (client) => {
        // REPEATABLE READ keeps the multi-query snapshot coherent.
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const found = await client.query<SnapshotRow & { role: ProjectSnapshot['role'] }>(
          `SELECT ${SNAPSHOT_FIELDS}, CASE WHEN owner_id=$1 THEN 'owner' ELSE 'editor' END AS role
           FROM projects WHERE id=$2 AND (owner_id=$1 OR id IN (${EDITABLE_PROJECT_IDS}))`,
          [userId, id],
        );
        const row = found.rows[0];
        if (!row) throw new ProjectStoreError(404, 'not_found');
        return assembleSnapshot(client, row, row.role);
      });
    },

    async create(ownerId: string, input: CreateProjectRequest): Promise<ProjectSnapshot> {
      checkUserId(ownerId);
      checkUuid(input?.id);
      checkUuid(input?.operationId);
      const project = projectValue(input.project);
      const requestHash = hash({ id: input.id, project });
      return tx(async (client) => {
        // Insert-on-conflict serializes concurrent retries on the client-generated project ID.
        const inserted = await insertProjectRow(client, ownerId, input.id, project);
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
        if (!inserted) throw new ProjectStoreError(409, 'operation_reused');
        await insertGuestsAndAssignments(client, input.id, project);
        await client.query(
          'INSERT INTO project_write_receipts (project_id,actor_id,operation_id,request_hash,result_revision) VALUES ($1,$2,$3,$4,1)',
          [input.id, ownerId, input.operationId, requestHash],
        );
        return assembleSnapshot(client, inserted, 'owner');
      });
    },

    async save(
      actorId: string,
      id: string,
      input: SaveProjectRequest,
    ): Promise<ProjectWriteResponse> {
      checkUserId(actorId);
      checkUuid(id);
      checkUuid(input?.operationId);
      checkRevision(input?.expectedRevision);
      const project = projectValue(input.project);
      const requestHash = hash({ expectedRevision: input.expectedRevision, project });
      return tx(async (client) => {
        await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        const locked = await client.query<{ owner_id: string; revision: number }>(
          `SELECT owner_id,revision FROM projects
           WHERE id=$2 AND (owner_id=$1 OR id IN (${EDITABLE_PROJECT_IDS})) FOR UPDATE`,
          [actorId, id],
        );
        const current = locked.rows[0];
        if (!current) throw new ProjectStoreError(404, 'not_found');
        if (current.owner_id !== actorId) {
          // A revogação usa o mesmo bloqueio. A consulta após a espera vê o estado recém-confirmado.
          const grant = await client.query(`SELECT 1 WHERE $2::uuid IN (${EDITABLE_PROJECT_IDS})`, [
            actorId,
            id,
          ]);
          if (!grant.rowCount) throw new ProjectStoreError(404, 'not_found');
        }
        const prior = await client.query<{
          request_hash: string;
          result_revision: number;
          created_at: Date;
        }>(
          'SELECT request_hash,result_revision,created_at FROM project_write_receipts WHERE project_id=$1 AND actor_id=$2 AND operation_id=$3',
          [id, actorId, input.operationId],
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
          [id, current.owner_id],
        );
        const revision = updated.rows[0]!.revision;
        await client.query(
          'INSERT INTO project_write_receipts (project_id,actor_id,operation_id,request_hash,result_revision) VALUES ($1,$2,$3,$4,$5)',
          [id, actorId, input.operationId, requestHash, revision],
        );
        return { id, revision, updatedAt: updated.rows[0]!.updated_at.toISOString() };
      });
    },

    async delete(ownerId: string, id: string, expectedRevision: number): Promise<void> {
      checkUserId(ownerId);
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
