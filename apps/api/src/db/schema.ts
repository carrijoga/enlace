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
import type { CeremonyProject, Reception } from '@enlace/contracts';
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
    // Planta da festa sem as atribuições (salão, mesas e elementos); nula enquanto não existir.
    receptionSchemaVersion: integer('reception_schema_version'),
    reception: jsonb('reception').$type<Omit<Reception, 'tableAssignments'>>(),
    // Categorias de convidado criadas no projeto (`id`, `label`, `color`); validadas pelo contrato.
    guestCategories: jsonb('guest_categories')
      .$type<CeremonyProject['guestCategories']>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('projects_owner_updated_idx').on(table.ownerId, table.updatedAt.desc()),
    check('projects_layout_schema_version_check', sql`${table.layoutSchemaVersion} = 1`),
    check('projects_revision_positive_check', sql`${table.revision} > 0`),
    // Escrito sem comparações que resultem em NULL: CHECK com resultado NULL passa.
    check(
      'projects_reception_check',
      sql`(${table.reception} IS NULL) = (${table.receptionSchemaVersion} IS NULL) AND (${table.reception} IS NULL OR (jsonb_typeof(${table.reception}) = 'object' AND ${table.receptionSchemaVersion} = 1))`,
    ),
    check('projects_guest_categories_check', sql`jsonb_typeof(${table.guestCategories}) = 'array'`),
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
      // Categoria padrão ou o UUID de uma categoria personalizada do projeto.
      sql`${table.category} IN ('familia','padrinho','madrinha','pajem','convidado') OR ${table.category} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
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

// Mesa da festa de cada convidado. A mesa vive no JSONB `projects.reception`; a existência dela é
// validada pelo contrato antes da gravação. A ordem importa: reduzir cadeiras retira os últimos.
export const tableAssignments = pgTable(
  'table_assignments',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    guestId: uuid('guest_id').notNull(),
    tableId: uuid('table_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.guestId] }),
    index('table_assignments_project_table_idx').on(table.projectId, table.tableId),
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

// ADR-0014. O token não é guardado: é derivado do id com o segredo do servidor.
export const projectShareLinks = pgTable(
  'project_share_links',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    mode: text('mode').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('project_share_links_project_idx').on(table.projectId),
    check('project_share_links_mode_check', sql`${table.mode} IN ('names','plan','edit','clone')`),
    check(
      'project_share_links_label_check',
      sql`char_length(${table.label}) BETWEEN 1 AND 60 AND btrim(${table.label}) <> ''`,
    ),
    check(
      'project_share_links_expiry_check',
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const projectLinkEditors = pgTable(
  'project_link_editors',
  {
    linkId: uuid('link_id')
      .notNull()
      .references(() => projectShareLinks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.linkId, table.userId] }),
    index('project_link_editors_user_idx').on(table.userId),
  ],
);

export const projectLinkCloneReceipts = pgTable(
  'project_link_clone_receipts',
  {
    linkId: uuid('link_id')
      .notNull()
      .references(() => projectShareLinks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.linkId, table.userId] }),
    index('project_link_clone_receipts_user_idx').on(table.userId),
    unique('project_link_clone_receipts_project_unique').on(table.projectId),
  ],
);
