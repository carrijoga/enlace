/**
 * Contrato da planta da festa (fase 6, ADR-0012). `projectSchema` é o projeto completo: a
 * cerimônia estrita mais `reception`, obrigatório e anulável.
 */
import { z } from 'zod';
import { ceremonyProjectSchema, type CeremonyProject } from './ceremony.js';

export const RECEPTION_LIMITS = {
  /** Maior coordenada, em centímetros: salão de até 100 × 100 m. */
  maxCoordinate: 10_000,
  minWall: 10,
  minOutlinePoints: 4,
  maxOutlinePoints: 64,
  maxDoors: 20,
  maxColumns: 40,
  maxTables: 100,
  maxItems: 60,
  minTableSeats: 1,
  maxTableSeats: 24,
  maxNameLength: 40,
} as const;

const coordinateSchema = z.number().int().min(0).max(RECEPTION_LIMITS.maxCoordinate);
const rotationSchema = z.number().int().min(0).max(359);
const nameSchema = z
  .string()
  .min(1)
  .max(RECEPTION_LIMITS.maxNameLength)
  .refine((value) => value.trim().length > 0, 'Nome não pode conter apenas espaços');

const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema }).strict();
export type RoomPoint = z.infer<typeof pointSchema>;

/**
 * Motivo pelo qual o contorno não é um polígono ortogonal fechado e simples, ou `null` se for
 * válido. O último ponto liga-se implicitamente ao primeiro.
 */
export function findRoomOutlineError(outline: readonly RoomPoint[]): string | null {
  const { minOutlinePoints, maxOutlinePoints, maxCoordinate, minWall } = RECEPTION_LIMITS;
  const count = outline.length;
  if (count < minOutlinePoints) return 'O salão precisa de pelo menos 4 paredes.';
  if (count > maxOutlinePoints) return `O salão aceita até ${maxOutlinePoints} paredes.`;
  if (count % 2 !== 0) return 'Paredes em ângulo reto precisam formar um número par de lados.';
  for (const { x, y } of outline)
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x > maxCoordinate ||
      y > maxCoordinate
    )
      return 'O salão pode ter até 100 × 100 m.';

  const walls = outline.map((start, index) => {
    const end = outline[(index + 1) % count]!;
    return {
      horizontal: start.y === end.y,
      vertical: start.x === end.x,
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
      length: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
    };
  });
  for (let index = 0; index < count; index++) {
    const wall = walls[index]!;
    if (wall.horizontal === wall.vertical) return 'Todas as paredes precisam formar ângulo reto.';
    if (wall.length < minWall) return 'Cada parede precisa ter pelo menos 10 cm.';
    if (wall.horizontal === walls[(index + 1) % count]!.horizontal)
      return 'Paredes consecutivas precisam formar ângulo reto.';
  }
  // Segmentos alinhados aos eixos só se tocam quando suas caixas se tocam.
  for (let a = 0; a < count; a++)
    for (let b = a + 2; b < count; b++) {
      if (a === 0 && b === count - 1) continue;
      const first = walls[a]!;
      const second = walls[b]!;
      if (
        first.left <= second.right &&
        second.left <= first.right &&
        first.top <= second.bottom &&
        second.top <= first.bottom
      )
        return 'As paredes do salão não podem se cruzar.';
    }
  return null;
}

/** Abertura da porta: folha para dentro, para fora do salão ou de correr ao longo da parede. */
export const RECEPTION_DOOR_OPENINGS = ['inward', 'outward', 'sliding'] as const;

const doorSchema = z
  .object({
    id: z.uuid(),
    /** Índice da parede: liga o ponto `wall` do contorno ao seguinte. */
    wall: z.number().int().min(0).max(63),
    /** Distância, em centímetros, do início da parede até a porta. */
    offset: coordinateSchema,
    width: z.number().int().min(40).max(1000),
    /** Ausente em arquivos anteriores a esta opção: vale como porta que abre para dentro. */
    opening: z.enum(RECEPTION_DOOR_OPENINGS).default('inward'),
  })
  .strict();

const columnSchema = z
  .object({
    id: z.uuid(),
    x: coordinateSchema,
    y: coordinateSchema,
    width: z.number().int().min(10).max(1000),
    depth: z.number().int().min(10).max(1000),
  })
  .strict();

const roomSchema = z
  .object({
    outline: z.array(pointSchema).max(RECEPTION_LIMITS.maxOutlinePoints),
    doors: z.array(doorSchema).max(RECEPTION_LIMITS.maxDoors),
    columns: z.array(columnSchema).max(RECEPTION_LIMITS.maxColumns),
  })
  .strict()
  .superRefine((room, ctx) => {
    const outlineError = findRoomOutlineError(room.outline);
    if (outlineError) {
      ctx.addIssue({ code: 'custom', path: ['outline'], message: outlineError });
      return;
    }
    room.doors.forEach((door, index) => {
      if (door.wall >= room.outline.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['doors', index, 'wall'],
          message: 'Parede inexistente',
        });
        return;
      }
      const start = room.outline[door.wall]!;
      const end = room.outline[(door.wall + 1) % room.outline.length]!;
      if (door.offset + door.width > Math.abs(end.x - start.x) + Math.abs(end.y - start.y))
        ctx.addIssue({
          code: 'custom',
          path: ['doors', index],
          message: 'A porta não cabe na parede',
        });
    });
  });

const tableSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema,
    shape: z.enum(['round', 'rect']),
    /** Centro da mesa, em centímetros. */
    x: coordinateSchema,
    y: coordinateSchema,
    rotation: rotationSchema,
    width: z.number().int().min(40).max(1000),
    depth: z.number().int().min(40).max(1000),
    seats: z.number().int().min(RECEPTION_LIMITS.minTableSeats).max(RECEPTION_LIMITS.maxTableSeats),
  })
  .strict()
  .refine((table) => table.shape !== 'round' || table.width === table.depth, {
    path: ['depth'],
    message: 'Mesa redonda precisa ter largura e profundidade iguais',
  });

export const RECEPTION_ITEM_KINDS = [
  'dance_floor',
  'dj',
  'cake_table',
  'sweets_table',
  'bar',
  'buffet',
  'photo_area',
  'custom',
] as const;

const itemSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(RECEPTION_ITEM_KINDS),
    name: nameSchema,
    /** Centro do elemento, em centímetros. */
    x: coordinateSchema,
    y: coordinateSchema,
    rotation: rotationSchema,
    width: z.number().int().min(10).max(RECEPTION_LIMITS.maxCoordinate),
    depth: z.number().int().min(10).max(RECEPTION_LIMITS.maxCoordinate),
  })
  .strict();

const tableAssignmentSchema = z.object({ tableId: z.uuid(), guestId: z.uuid() }).strict();

export const receptionSchema = z
  .object({
    room: roomSchema,
    tables: z.array(tableSchema).max(RECEPTION_LIMITS.maxTables),
    items: z.array(itemSchema).max(RECEPTION_LIMITS.maxItems),
    tableAssignments: z.array(tableAssignmentSchema).max(300),
  })
  .strict()
  .superRefine((reception, ctx) => {
    const seen = new Set<string>();
    const unique = (id: string, path: (string | number)[]) => {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path, message: 'ID duplicado' });
      seen.add(id);
    };
    reception.room.doors.forEach((door, i) => unique(door.id, ['room', 'doors', i, 'id']));
    reception.room.columns.forEach((column, i) => unique(column.id, ['room', 'columns', i, 'id']));
    reception.tables.forEach((table, i) => unique(table.id, ['tables', i, 'id']));
    reception.items.forEach((item, i) => unique(item.id, ['items', i, 'id']));

    const tableIds = new Set(reception.tables.map((table) => table.id));
    const assignedGuests = new Set<string>();
    reception.tableAssignments.forEach((assignment, index) => {
      if (!tableIds.has(assignment.tableId))
        ctx.addIssue({
          code: 'custom',
          path: ['tableAssignments', index, 'tableId'],
          message: 'Mesa inexistente',
        });
      if (assignedGuests.has(assignment.guestId))
        ctx.addIssue({
          code: 'custom',
          path: ['tableAssignments', index, 'guestId'],
          message: 'Convidado em mais de uma mesa',
        });
      assignedGuests.add(assignment.guestId);
    });
  });

export type Reception = z.infer<typeof receptionSchema>;
export type ReceptionTable = Reception['tables'][number];
export type ReceptionItem = Reception['items'][number];
export type ReceptionItemKind = ReceptionItem['kind'];
export type ReceptionDoor = Reception['room']['doors'][number];
export type ReceptionDoorOpening = ReceptionDoor['opening'];
export type ReceptionColumn = Reception['room']['columns'][number];
export type Project = CeremonyProject & { reception: Reception | null };

/**
 * A cerimônia tem refinamentos e não pode ser estendida; por isso `reception` é separada aqui e o
 * restante passa pelo schema estrito da cerimônia, que continua recusando campos desconhecidos.
 */
export const projectSchema = z
  .looseObject({ reception: receptionSchema.nullable() })
  .transform((value, ctx): Project => {
    const { reception, ...ceremony } = value;
    const parsed = ceremonyProjectSchema.safeParse(ceremony);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: issue.path as (string | number)[],
          message: issue.message,
        });
      return z.NEVER;
    }
    if (reception) {
      const guestIds = new Set(parsed.data.guests.map((guest) => guest.id));
      reception.tableAssignments.forEach((assignment, index) => {
        if (!guestIds.has(assignment.guestId))
          ctx.addIssue({
            code: 'custom',
            path: ['reception', 'tableAssignments', index, 'guestId'],
            message: 'Convidado inexistente',
          });
      });
    }
    return { ...parsed.data, reception };
  });
