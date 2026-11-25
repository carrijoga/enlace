import { z } from 'zod';
import {
  GUEST_CATEGORY_LIMITS,
  MAX_PROJECT_FILE_BYTES,
  checkGuestCategories,
  createUuid,
  customGuestCategorySchema,
  dateSchema,
  guestSchema,
  layoutSchema,
  migrateLegacyV3,
  projectDocumentV1Schema,
  uuidSchema,
  type CeremonyProject,
} from './ceremony.js';
import { projectSchema, type Project } from './reception.js';

export {
  BUILTIN_GUEST_CATEGORIES,
  BUILTIN_GUEST_CATEGORY_LABELS,
  GUEST_CATEGORY_COLORS,
  GUEST_CATEGORY_LIMITS,
  MAX_PROJECT_FILE_BYTES,
  categoryLabelKey,
  ceremonyProjectSchema,
  createUuid,
  customGuestCategorySchema,
  guestCategoryKeySchema,
  projectDocumentV1Schema,
  type BuiltinGuestCategory,
  type CeremonyProject,
  type CustomGuestCategory,
  type GuestCategoryColor,
} from './ceremony.js';
export * from './reception.js';

export const healthResponseSchema = z
  .object({ status: z.literal('ok'), service: z.literal('enlace-api'), version: z.string().min(1) })
  .strict();
export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    service: z.literal('enlace-api'),
    version: z.string().min(1),
  })
  .strict();

/** Envelope atual (v2): cerimônia mais `reception`, obrigatório e anulável. */
export const projectDocumentSchema = z
  .object({
    format: z.literal('enlace-project'),
    schemaVersion: z.literal(2),
    exportedAt: z.iso.datetime(),
    project: projectSchema,
  })
  .strict();

export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

const withoutReception = (project: CeremonyProject): Project => ({ ...project, reception: null });

/** Lê o envelope v2 e migra o v1 e o snapshot v3 legado com `reception: null`. */
export function parseProjectFile(text: string): ProjectDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES)
    throw new Error('Arquivo excede o limite de 2 MiB.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error('Arquivo de projeto inválido.');
  if ('version' in data) {
    if ((data as { version?: unknown }).version !== 3)
      throw new Error('Versão do arquivo legado não suportada.');
    return projectDocumentSchema.parse({
      format: 'enlace-project',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      project: withoutReception(migrateLegacyV3(data)),
    });
  }
  const version = (data as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) {
    const v1 = projectDocumentV1Schema.parse(data);
    return projectDocumentSchema.parse({
      ...v1,
      schemaVersion: 2,
      project: withoutReception(v1.project),
    });
  }
  if (version !== 2) throw new Error('Versão do arquivo não suportada.');
  return projectDocumentSchema.parse(data);
}

export function createDemoDocument(): ProjectDocument {
  const uuid = createUuid;
  const counts = [
    [6, 5],
    [5, 6],
    [6, 5],
    [5, 6],
    [6, 5],
  ];
  const rows = counts.map(([left, right]) => ({
    id: uuid(),
    leftSeatIds: Array.from({ length: left }, uuid),
    rightSeatIds: Array.from({ length: right }, uuid),
  }));
  const project: Project = {
    title: 'Cerimônia de exemplo',
    couple: { first: 'Alex', second: 'Ravi' },
    weddingDate: null,
    layout: { mode: 'straight', curveStrength: 50, aisleWidth: 1.8, linkedCounts: true, rows },
    guestCategories: [],
    guests: [],
    assignments: [],
    reception: null,
  };
  return projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    project,
  });
}

const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const projectRoleSchema = z.enum(['owner', 'editor']);
export const projectSummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    role: projectRoleSchema,
    revision: revisionSchema,
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const projectWriteResponseSchema = projectSummarySchema.omit({ title: true, role: true });
export const projectSnapshotSchema = projectWriteResponseSchema.extend({
  role: projectRoleSchema,
  project: projectSchema,
});
export const projectListResponseSchema = z
  .object({ projects: z.array(projectSummarySchema) })
  .strict();
export const createProjectRequestSchema = z
  .object({
    id: z.uuid(),
    operationId: z.uuid(),
    project: projectSchema,
  })
  .strict();
export const saveProjectRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    operationId: z.uuid(),
    project: projectSchema,
  })
  .strict();
export const deleteProjectRequestSchema = z.object({ expectedRevision: revisionSchema }).strict();
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
export type ProjectWriteResponse = z.infer<typeof projectWriteResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type SaveProjectRequest = z.infer<typeof saveProjectRequestSchema>;

// Visualização pública (ADR-0014) e participação autenticada (ADR-0016).

export const MAX_ACTIVE_SHARE_LINKS = 10;
/** `base64url(linkId[16 bytes] ‖ HMAC-SHA256[32 bytes])`, sem preenchimento: 64 caracteres. */
export const SHARE_TOKEN_LENGTH = 64;

const participationModeSchema = z.enum(['edit', 'clone']);
export const shareLinkModeSchema = z.enum(['names', 'plan', ...participationModeSchema.options]);
export const shareLinkExpirySchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
  z.null(),
]);
const shareLinkLabelSchema = z
  .string()
  .min(1)
  .max(60)
  .refine((value) => value.trim().length > 0, 'Nome do link não pode conter apenas espaços');
export const shareTokenSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${SHARE_TOKEN_LENGTH}}$`), 'Link inválido');

export const createShareLinkRequestSchema = z
  .object({
    label: shareLinkLabelSchema,
    mode: shareLinkModeSchema,
    expiresInDays: shareLinkExpirySchema,
  })
  .strict();
export const shareLinkSchema = z
  .object({
    id: uuidSchema,
    label: shareLinkLabelSchema,
    mode: shareLinkModeSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    token: shareTokenSchema,
  })
  .strict();
export const shareLinkListResponseSchema = z
  .object({ links: z.array(shareLinkSchema).max(MAX_ACTIVE_SHARE_LINKS) })
  .strict();
export const sharedViewRequestSchema = z.object({ token: shareTokenSchema }).strict();
export const redeemShareLinkRequestSchema = sharedViewRequestSchema.extend({
  mode: participationModeSchema,
});
export const redeemShareLinkResponseSchema = z.object({ projectId: uuidSchema }).strict();
/** Corpo vazio: métodos que alteram dados sempre mandam JSON pelo proxy. */
export const revokeShareLinkRequestSchema = z.object({}).strict();

/** Planta sem `linkedCounts`, que é preferência do editor e não interessa a quem só vê. */
const sharedLayoutSchema = layoutSchema.omit({ linkedCounts: true });
const sharedBaseShape = {
  couple: z.object({ first: z.string().max(80), second: z.string().max(80) }).strict(),
  weddingDate: dateSchema.nullable(),
  layout: sharedLayoutSchema,
};
const sharedSeatSchema = z
  .object({
    seatId: uuidSchema,
    name: guestSchema.shape.name,
    category: guestSchema.shape.category,
  })
  .strict();

export const sharedViewSchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('names'),
        ...sharedBaseShape,
        /** Só as categorias personalizadas de quem tem cadeira; ausente em respostas antigas. */
        guestCategories: z
          .array(customGuestCategorySchema)
          .max(GUEST_CATEGORY_LIMITS.maxCustom)
          .default([]),
        seats: z.array(sharedSeatSchema).max(300),
      })
      .strict(),
    z
      .object({
        mode: z.literal('plan'),
        ...sharedBaseShape,
        occupiedSeatIds: z.array(uuidSchema).max(300),
      })
      .strict(),
  ])
  .superRefine((view, ctx) => {
    const seats = new Set<string>();
    view.layout.rows.forEach((row, index) => {
      for (const seatId of [...row.leftSeatIds, ...row.rightSeatIds]) {
        if (seats.has(seatId))
          ctx.addIssue({
            code: 'custom',
            path: ['layout', 'rows', index],
            message: 'ID de cadeira duplicado',
          });
        seats.add(seatId);
      }
    });
    const occupied =
      view.mode === 'names' ? view.seats.map((seat) => seat.seatId) : view.occupiedSeatIds;
    const seen = new Set<string>();
    occupied.forEach((seatId, index) => {
      const path = view.mode === 'names' ? ['seats', index, 'seatId'] : ['occupiedSeatIds', index];
      if (!seats.has(seatId))
        ctx.addIssue({ code: 'custom', path, message: 'Cadeira inexistente' });
      if (seen.has(seatId)) ctx.addIssue({ code: 'custom', path, message: 'Cadeira repetida' });
      seen.add(seatId);
    });
    if (view.mode === 'names')
      checkGuestCategories(
        view.guestCategories,
        view.seats.map((seat, index) => ({
          category: seat.category,
          path: ['seats', index, 'category'],
        })),
        ctx,
        'guestCategories',
      );
  });

export type ShareLinkMode = z.infer<typeof shareLinkModeSchema>;
export type CreateShareLinkRequest = z.infer<typeof createShareLinkRequestSchema>;
export type ShareLink = z.infer<typeof shareLinkSchema>;
export type SharedViewRequest = z.infer<typeof sharedViewRequestSchema>;
export type RedeemShareLinkRequest = z.infer<typeof redeemShareLinkRequestSchema>;
export type SharedView = z.infer<typeof sharedViewSchema>;
