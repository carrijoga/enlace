import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createProjectStore } from './store.js';
import { migrate } from '../db/migrate.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const projectId = '1a2b3c4d-1111-4111-8111-111111111111';
const operationId = '1a2b3c4d-2222-4222-8222-222222222222';
const rowId = '1a2b3c4d-3333-4333-8333-333333333333';
const seatId = '1a2b3c4d-4444-4444-8444-444444444444';
const guestId = '1a2b3c4d-5555-4555-8555-555555555555';
const ownerId = 'integration-owner';
const foreignOwnerId = 'integration-other';
const project = {
  title: 'Cerimônia de teste',
  couple: { first: 'Lia', second: 'Noah' },
  weddingDate: null,
  layout: {
    mode: 'straight' as const,
    curveStrength: 50,
    aisleWidth: 1.8 as const,
    linkedCounts: true,
    rows: [{ id: rowId, leftSeatIds: [seatId], rightSeatIds: [] }],
  },
  guests: [{ id: guestId, name: 'Convidada fictícia', category: 'convidado' as const, note: '' }],
  assignments: [{ seatId, guestId }],
};

suite('PostgreSQL project store (opt-in isolated schema)', () => {
  let admin: Pool;
  let pool: Pool;
  let store: ReturnType<typeof createProjectStore>;
  let runtimePool: Pool;
  let runtimeStore: ReturnType<typeof createProjectStore>;
  const schema = `enlace_it_${process.pid}`;
  const runtimeRole = `enlace_app_${process.pid}`;

  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    const migration = await readFile(
      resolve(import.meta.dirname, '../../drizzle/0000_initial.sql'),
      'utf8',
    );
    await pool.query(migration.replaceAll('"public".', `"${schema}".`));
    await pool.query('INSERT INTO "user" (id,name,email) VALUES ($1,$1,$2),($3,$3,$4)', [
      ownerId,
      'owner@example.test',
      foreignOwnerId,
      'other@example.test',
    ]);
    await pool.query(`CREATE TABLE ${schema}.enlace_migrations (name text PRIMARY KEY)`);
    const loginRole = (await pool.query('SELECT current_user AS name')).rows[0]!.name as string;
    await admin.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);
    await admin.query(`GRANT "${runtimeRole}" TO "${loginRole}"`);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtimeRole}"`);
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${schema}.projects,${schema}.guests,${schema}.seat_assignments,${schema}.project_write_receipts TO "${runtimeRole}"`,
    );
    runtimePool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema} -c role=${runtimeRole}`,
    });
    runtimeStore = createProjectStore(runtimePool);
    store = createProjectStore(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await runtimePool?.end();
    if (admin) {
      await admin.query(`REVOKE "${runtimeRole}" FROM CURRENT_USER`).catch(() => undefined);
      await admin.query(`DROP ROLE IF EXISTS "${runtimeRole}"`).catch(() => undefined);
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  it('persists and reads a coherent aggregate, with owner scoped access', async () => {
    const created = await store.create(ownerId, { id: projectId, operationId, project });
    expect(created.revision).toBe(1);
    expect(created.project.assignments).toEqual([{ seatId, guestId }]);
    expect(await store.list(foreignOwnerId)).toEqual([]);
    await expect(store.get(foreignOwnerId, projectId)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect((await store.get(ownerId, projectId)).project.guests[0]?.name).toBe(
      'Convidada fictícia',
    );
    await expect(
      store.create(ownerId, {
        id: projectId,
        operationId,
        project: { ...project, title: 'Outra operação' },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'operation_reused' });
  });

  it('serializes concurrent creation retries and returns a coherent existing snapshot', async () => {
    const id = '1a2b3c4d-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const op = '1a2b3c4d-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const creations = await Promise.all([
      store.create(ownerId, { id, operationId: op, project }),
      store.create(ownerId, { id, operationId: op, project }),
    ]);
    expect(creations.map((item) => item.revision)).toEqual([1, 1]);
    await store.save(ownerId, id, {
      expectedRevision: 1,
      operationId: '1a2b3c4d-cccc-4ccc-8ccc-cccccccccccc',
      project: { ...project, title: 'Depois da criação' },
    });
    const replay = await store.create(ownerId, { id, operationId: op, project });
    expect(replay.revision).toBe(2);
    expect(replay.project.title).toBe('Depois da criação');
    await store.delete(ownerId, id, 2);
  });

  it('replays an operation once and rejects conflicting revisions and operation reuse', async () => {
    const saved = await store.save(ownerId, projectId, {
      expectedRevision: 1,
      operationId: '1a2b3c4d-6666-4666-8666-666666666666',
      project: { ...project, title: 'Atualizado' },
    });
    expect(saved.revision).toBe(2);
    const replay = await store.save(ownerId, projectId, {
      expectedRevision: 1,
      operationId: '1a2b3c4d-6666-4666-8666-666666666666',
      project: { ...project, title: 'Atualizado' },
    });
    expect(replay.revision).toBe(2);
    expect(replay.updatedAt).toBe(saved.updatedAt);
    await expect(
      store.save(ownerId, projectId, {
        expectedRevision: 1,
        operationId: '1a2b3c4d-7777-4777-8777-777777777777',
        project,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'revision_conflict' });
    await expect(
      store.save(ownerId, projectId, {
        expectedRevision: 1,
        operationId: '1a2b3c4d-6666-4666-8666-666666666666',
        project,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'operation_reused' });
    expect((await store.get(ownerId, projectId)).project.title).toBe('Atualizado');
    const race = await Promise.allSettled([
      store.save(ownerId, projectId, {
        expectedRevision: 2,
        operationId: '1a2b3c4d-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        project: { ...project, title: 'Vencedor A' },
      }),
      store.save(ownerId, projectId, {
        expectedRevision: 2,
        operationId: '1a2b3c4d-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        project: { ...project, title: 'Vencedor B' },
      }),
    ]);
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rolls back aggregate replacement when a database constraint fails', async () => {
    await pool.query(
      `CREATE FUNCTION fail_project_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic transaction failure'; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER fail_project_update BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fail_project_update()',
    );
    await expect(
      store.save(ownerId, projectId, {
        expectedRevision: 3,
        operationId: '1a2b3c4d-9999-4999-8999-999999999999',
        project: { ...project, title: 'Não deve gravar' },
      }),
    ).rejects.toThrow();
    await pool.query('DROP TRIGGER fail_project_update ON projects');
    await pool.query('DROP FUNCTION fail_project_update()');
    const snapshot = await store.get(ownerId, projectId);
    expect(snapshot.revision).toBe(3);
    expect(['Vencedor A', 'Vencedor B']).toContain(snapshot.project.title);
  });

  it('deletes only the matching owner and revision', async () => {
    await expect(store.delete(foreignOwnerId, projectId, 3)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    await expect(store.delete(ownerId, projectId, 1)).rejects.toMatchObject({
      status: 409,
      code: 'revision_conflict',
    });
    await store.delete(ownerId, projectId, 3);
    await expect(store.get(ownerId, projectId)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('runs with table DML only and cannot read the migration ledger or perform DDL', async () => {
    const id = '1a2b3c4d-dddd-4ddd-8ddd-dddddddddddd';
    const op = '1a2b3c4d-eeee-4eee-8eee-eeeeeeeeeeee';
    const created = await runtimeStore.create(ownerId, { id, operationId: op, project });
    expect(created.revision).toBe(1);
    const saved = await runtimeStore.save(ownerId, id, {
      expectedRevision: 1,
      operationId: '1a2b3c4d-ffff-4fff-8fff-ffffffffffff',
      project: { ...project, title: 'Role de runtime' },
    });
    expect(saved.revision).toBe(2);
    await expect(runtimePool.query('SELECT * FROM enlace_migrations')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      runtimePool.query('CREATE TABLE forbidden_runtime_ddl (id int)'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(runtimePool.query('DROP TABLE projects')).rejects.toMatchObject({ code: '42501' });
    await pool.query('DELETE FROM projects WHERE id=$1', [id]);
  });
});

const migrationSuite =
  databaseUrl && process.env.TEST_CREATE_DATABASE === '1' ? describe : describe.skip;
migrationSuite('PostgreSQL migration runner (temporary database)', () => {
  it('applies the versioned Drizzle baseline once and is idempotent', async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    const dbName = `enlace_mig_${process.pid}`;
    let tempPool: Pool | undefined;
    const tempUrl = new URL(databaseUrl!);
    tempUrl.pathname = `/${dbName}`;
    try {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      const first = await migrate(tempUrl.toString());
      const second = await migrate(tempUrl.toString());
      expect(first).toEqual(['0000_initial.sql', '0001_remove_receipt_date_index.sql']);
      expect(second).toEqual([]);
      tempPool = new Pool({ connectionString: tempUrl.toString() });
      const tables = await tempPool.query(
        "SELECT to_regclass('public.projects') AS projects, to_regclass('public.user') AS auth_user",
      );
      expect(tables.rows[0]).toEqual({ projects: 'projects', auth_user: '"user"' });
    } finally {
      await tempPool?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  });
});
