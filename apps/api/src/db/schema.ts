import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CeremonyProject } from '@enlace/contracts';
import { user as authUsers } from '../auth-schema.js';

// The authentication adapter owns the `user` table. User IDs are text by contract.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    coupleFirst: text('couple_first').notNull(),
    coupleSecond: text('couple_second').notNull(),
    weddingDate: date('wedding_date'),
    layoutSchemaVersion: integer('layout_schema_version').notNull().default(1),
    layout: jsonb('layout').$type<CeremonyProject['layout']>().notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('projects_owner_updated_idx').on(table.ownerId, table.updatedAt.desc()),
    check('projects_layout_schema_version_check', sql`${table.layoutSchemaVersion} = 1`),
    check('projects_revision_positive_check', sql`${table.revision} > 0`),
  ],
);

export const guests = pgTable(
  'guests',
  {
    id: uuid('id').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    note: text('note').notNull().default(''),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.id] }),
    index('guests_project_order_idx').on(table.projectId, table.sortOrder),
    check(
      'guests_category_check',
      sql`${table.category} IN ('familia','padrinho','madrinha','pajem','convidado')`,
    ),
  ],
);

export const seatAssignments = pgTable(
  'seat_assignments',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').notNull(),
    guestId: uuid('guest_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.seatId] }),
    unique('seat_assignments_project_guest_unique').on(table.projectId, table.guestId),
    foreignKey({
      columns: [table.projectId, table.guestId],
      foreignColumns: [guests.projectId, guests.id],
    }).onDelete('cascade'),
  ],
);

export const projectWriteReceipts = pgTable(
  'project_write_receipts',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    requestHash: text('request_hash').notNull(),
    resultRevision: integer('result_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.actorId, table.operationId] }),
    check('project_write_receipts_revision_positive_check', sql`${table.resultRevision} > 0`),
    foreignKey({ columns: [table.actorId], foreignColumns: [authUsers.id] }).onDelete('cascade'),
  ],
);
