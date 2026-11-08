import { z } from 'zod';

export const MAX_PROJECT_FILE_BYTES = 2 * 1024 * 1024;
const uuidSchema = z.uuid();
const dateSchema = z.iso.date().refine((date) => {
  const [year, month, day] = date.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}, 'Data inválida');

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

const seatListSchema = z.array(uuidSchema).max(12);
const rowSchema = z
  .object({ id: uuidSchema, leftSeatIds: seatListSchema, rightSeatIds: seatListSchema })
  .strict();
const guestSchema = z
  .object({
    id: uuidSchema,
    name: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => value.trim().length > 0, 'Nome não pode conter apenas espaços'),
    category: z.enum(['familia', 'padrinho', 'madrinha', 'pajem', 'convidado']),
    note: z.string().max(1000),
  })
  .strict();
const assignmentSchema = z.object({ seatId: uuidSchema, guestId: uuidSchema }).strict();

const layoutSchema = z
  .object({
    mode: z.enum(['curve', 'straight']),
    curveStrength: z.number().int().min(0).max(100),
    aisleWidth: z.union([
      z.literal(1.2),
      z.literal(1.5),
      z.literal(1.8),
      z.literal(2.1),
      z.literal(2.4),
      z.literal(3),
    ]),
    linkedCounts: z.boolean(),
    rows: z.array(rowSchema).min(1).max(12),
  })
  .strict();

export const ceremonyProjectSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => value.trim().length > 0, 'Título não pode conter apenas espaços'),
    couple: z.object({ first: z.string().max(80), second: z.string().max(80) }).strict(),
    weddingDate: dateSchema.nullable(),
    layout: layoutSchema,
    guests: z.array(guestSchema).max(300),
    assignments: z.array(assignmentSchema).max(300),
  })
  .strict()
  .superRefine((project, ctx) => {
    const rowIds = new Set<string>();
    const seats = new Set<string>();
    project.layout.rows.forEach((row, index) => {
      if (rowIds.has(row.id))
        ctx.addIssue({
          code: 'custom',
          path: ['layout', 'rows', index, 'id'],
          message: 'ID de fileira duplicado',
        });
      rowIds.add(row.id);
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
    const guestIds = new Set<string>();
    project.guests.forEach((guest, index) => {
      if (guestIds.has(guest.id))
        ctx.addIssue({
          code: 'custom',
          path: ['guests', index, 'id'],
          message: 'ID de convidado duplicado',
        });
      guestIds.add(guest.id);
    });
    const assignedSeats = new Set<string>();
    const assignedGuests = new Set<string>();
    project.assignments.forEach((assignment, index) => {
      if (!seats.has(assignment.seatId))
        ctx.addIssue({
          code: 'custom',
          path: ['assignments', index, 'seatId'],
          message: 'Cadeira inexistente',
        });
      if (!guestIds.has(assignment.guestId))
        ctx.addIssue({
          code: 'custom',
          path: ['assignments', index, 'guestId'],
          message: 'Convidado inexistente',
        });
      if (assignedSeats.has(assignment.seatId))
        ctx.addIssue({
          code: 'custom',
          path: ['assignments', index, 'seatId'],
          message: 'Cadeira atribuída mais de uma vez',
        });
      if (assignedGuests.has(assignment.guestId))
        ctx.addIssue({
          code: 'custom',
          path: ['assignments', index, 'guestId'],
          message: 'Convidado atribuído mais de uma vez',
        });
      assignedSeats.add(assignment.seatId);
      assignedGuests.add(assignment.guestId);
    });
  });

export const projectDocumentSchema = z
  .object({
    format: z.literal('enlace-project'),
    schemaVersion: z.literal(1),
    exportedAt: z.iso.datetime(),
    project: ceremonyProjectSchema,
  })
  .strict();

export type CeremonyProject = z.infer<typeof ceremonyProjectSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

const legacyPersonSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0),
    name: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => value.trim().length > 0),
    group: z.enum(['familia', 'padrinho', 'madrinha', 'pajem', 'convidado']),
    note: z.string().max(1000).optional(),
  })
  .strict();
const legacyV3Schema = z
  .object({
    version: z.literal(3),
    couple: z
      .object({ first: z.string().max(80), second: z.string().max(80) })
      .partial()
      .strict()
      .optional(),
    weddingDate: z.union([z.literal(''), dateSchema, z.null()]).optional(),
    aisleWidth: z
      .union([
        z.literal(1.2),
        z.literal(1.5),
        z.literal(1.8),
        z.literal(2.1),
        z.literal(2.4),
        z.literal(3),
      ])
      .optional(),
    linkedCounts: z.boolean().optional(),
    mode: z.enum(['curve', 'straight']),
    curveStrength: z.number().int().min(0).max(100).optional(),
    rows: z
      .array(z.tuple([z.number().int().min(0).max(12), z.number().int().min(0).max(12)]))
      .min(1)
      .max(12),
    people: z.array(legacyPersonSchema).max(300),
    assignments: z.record(z.string(), z.string()),
  })
  .strict();
type LegacyProject = z.infer<typeof legacyV3Schema>;

/**
 * UUID v4. `crypto.randomUUID` só existe em contexto seguro; em HTTP na rede local (ensaio em
 * celular físico) cai em `getRandomValues`, disponível em qualquer contexto.
 */
export function createUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function migrateLegacy(value: LegacyProject): ProjectDocument {
  const uuid = createUuid;
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 12)
    throw new Error('Arquivo v3 inválido: quantidade de fileiras fora do limite.');
  const rows = value.rows.map((counts, rowIndex) => {
    if (
      !Array.isArray(counts) ||
      counts.length !== 2 ||
      counts.some((n) => !Number.isInteger(n) || n < 0 || n > 12)
    )
      throw new Error(`Arquivo v3 inválido: contagem da fileira ${rowIndex} inválida.`);
    return {
      id: uuid(),
      leftSeatIds: Array.from({ length: counts[0] }, uuid),
      rightSeatIds: Array.from({ length: counts[1] }, uuid),
    };
  });
  const groupMap: Record<string, CeremonyProject['guests'][number]['category']> = {
    familia: 'familia',
    padrinho: 'padrinho',
    madrinha: 'madrinha',
    pajem: 'pajem',
    convidado: 'convidado',
  };
  const oldToNew = new Map<string, string>();
  const guests = value.people.map((person) => {
    if (!person || typeof person.id !== 'string' || oldToNew.has(person.id))
      throw new Error('Arquivo v3 inválido: ID de pessoa ausente ou duplicado.');
    const category = groupMap[person.group];
    if (!category)
      throw new Error(`Arquivo v3 inválido: categoria desconhecida (${person.group}).`);
    const id = uuid();
    oldToNew.set(person.id, id);
    return { id, name: person.name, category, note: person.note ?? '' };
  });
  const seatLookup = new Map<string, string>();
  rows.forEach((row, ri) => {
    row.leftSeatIds.forEach((id, si) => seatLookup.set(`L-${ri}-${si}`, id));
    row.rightSeatIds.forEach((id, si) => seatLookup.set(`R-${ri}-${si}`, id));
  });
  const assignments = Object.entries(value.assignments).map(([key, oldGuestId]) => {
    const seatId = seatLookup.get(key),
      guestId = oldToNew.get(oldGuestId);
    if (!seatId || !guestId)
      throw new Error(`Arquivo v3 inválido: atribuição sem referência válida (${key}).`);
    if (!/^[LR]-(0|[1-9]\d*)-(0|[1-9]\d*)$/.test(key))
      throw new Error(`Arquivo v3 inválido: posição de cadeira não canônica (${key}).`);
    return { seatId, guestId };
  });
  const project = ceremonyProjectSchema.parse({
    title: 'Meu projeto',
    couple: { first: value.couple?.first ?? '', second: value.couple?.second ?? '' },
    weddingDate:
      value.weddingDate === '' || value.weddingDate === undefined ? null : value.weddingDate,
    layout: {
      mode: value.mode,
      curveStrength: value.curveStrength ?? 50,
      aisleWidth: value.aisleWidth ?? 1.8,
      linkedCounts: value.linkedCounts ?? true,
      rows,
    },
    guests,
    assignments,
  });
  return projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
  });
}

export function parseProjectFile(text: string): ProjectDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES)
    throw new Error('Arquivo excede o limite de 2 MiB.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Arquivo JSON inválido.');
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    (data as { version?: unknown }).version === 3
  )
    return migrateLegacy(legacyV3Schema.parse(data));
  if (typeof data === 'object' && data !== null && 'version' in data)
    throw new Error('Versão do arquivo legado não suportada.');
  if (
    typeof data === 'object' &&
    data !== null &&
    'schemaVersion' in data &&
    (data as { schemaVersion: unknown }).schemaVersion !== 1
  )
    throw new Error('Versão do arquivo não suportada.');
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
  const project: CeremonyProject = {
    title: 'Cerimônia de exemplo',
    couple: { first: 'Alex', second: 'Ravi' },
    weddingDate: null,
    layout: { mode: 'straight', curveStrength: 50, aisleWidth: 1.8, linkedCounts: true, rows },
    guests: [],
    assignments: [],
  };
  return projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
  });
}
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const projectSummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    revision: revisionSchema,
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const projectWriteResponseSchema = projectSummarySchema.omit({ title: true });
export const projectSnapshotSchema = projectWriteResponseSchema.extend({
  project: ceremonyProjectSchema,
});
export const projectListResponseSchema = z
  .object({ projects: z.array(projectSummarySchema) })
  .strict();
export const createProjectRequestSchema = z
  .object({
    id: z.uuid(),
    operationId: z.uuid(),
    project: ceremonyProjectSchema,
  })
  .strict();
export const saveProjectRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    operationId: z.uuid(),
    project: ceremonyProjectSchema,
  })
  .strict();
export const deleteProjectRequestSchema = z.object({ expectedRevision: revisionSchema }).strict();
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
export type ProjectWriteResponse = z.infer<typeof projectWriteResponseSchema>;
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type SaveProjectRequest = z.infer<typeof saveProjectRequestSchema>;
