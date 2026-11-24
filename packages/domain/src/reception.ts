/**
 * Domínio da planta da festa (fase 6, ADR-0012): comandos imutáveis, geometria e avisos, em
 * centímetros inteiros. Em subpath próprio para ser carregado só quando a festa for aberta;
 * remover convidado fica em `removeGuest`, no índice, porque a cerimônia também o usa.
 */
import {
  RECEPTION_LIMITS,
  createUuid,
  findRoomOutlineError,
  projectSchema,
  type Project,
  type Reception,
  type ReceptionColumn,
  type ReceptionDoor,
  type ReceptionItem,
  type ReceptionItemKind,
  type ReceptionTable,
  type RoomPoint,
} from '@enlace/contracts';

export const GRID_CM = 10;
/** Faixa ocupada por cadeira e pessoa em volta da mesa, usada só nos avisos. */
export const CHAIR_RING_CM = 45;
/** Passagem mínima indicativa. Não substitui o projeto do local nem as normas de segurança. */
export const MIN_PASSAGE_CM = 90;
/** Até esta folga o elemento é considerado encostado, sem passagem pretendida. */
const FLUSH_CM = GRID_CM;
const CHAIR_OFFSET_CM = 25;
const EPSILON = 1e-6;

export const RECEPTION_ITEM_DEFAULTS: Record<
  ReceptionItemKind,
  { name: string; width: number; depth: number }
> = {
  dance_floor: { name: 'Pista de dança', width: 500, depth: 500 },
  dj: { name: 'DJ e som', width: 200, depth: 80 },
  cake_table: { name: 'Mesa de bolo', width: 150, depth: 80 },
  sweets_table: { name: 'Mesa de doces', width: 200, depth: 80 },
  bar: { name: 'Bar', width: 250, depth: 80 },
  buffet: { name: 'Buffet', width: 400, depth: 100 },
  photo_area: { name: 'Área de fotos', width: 250, depth: 250 },
  custom: { name: '', width: 100, depth: 100 },
};

/** Áreas por onde se caminha: não formam passagem estreita, mas ainda acusam sobreposição. */
const WALKABLE_KINDS: ReadonlySet<ReceptionItemKind> = new Set(['dance_floor', 'photo_area']);

// Como nos comandos da cerimônia, valida o projeto inteiro e devolve o objeto recebido para
// preservar o compartilhamento estrutural; o parse do Zod criaria uma cópia profunda.
const validate = (project: Project): Project => {
  projectSchema.parse(project);
  return project;
};

function requireReception(project: Project): Reception {
  if (!project.reception) throw new Error('O projeto ainda não tem planta da festa.');
  return project.reception;
}

const withReception = (project: Project, reception: Reception): Project =>
  validate({ ...project, reception });

function replaceById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  patch: Partial<NoInfer<T>>,
  notFound: string,
): T[] {
  if (!list.some((entry) => entry.id === id)) throw new Error(notFound);
  return list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
}

function removeById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  notFound: string,
): T[] {
  if (!list.some((entry) => entry.id === id)) throw new Error(notFound);
  return list.filter((entry) => entry.id !== id);
}

// Medidas

/** Converte metros digitados ("3,5" ou "3.50") em centímetros; `null` se o texto for inválido. */
export function parseMeters(text: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export function formatMeters(centimeters: number): string {
  return (centimeters / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function snapToGrid(value: number): number {
  return Math.min(
    RECEPTION_LIMITS.maxCoordinate,
    Math.max(0, Math.round(value / GRID_CM) * GRID_CM),
  );
}

export function normalizeRotation(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

// Contornos

function checkedOutline(outline: RoomPoint[]): RoomPoint[] {
  const error = findRoomOutlineError(outline);
  if (error) throw new Error(error);
  return outline;
}

export function createRectangleOutline(width: number, depth: number): RoomPoint[] {
  return checkedOutline([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ]);
}

export function createSquareOutline(side: number): RoomPoint[] {
  return createRectangleOutline(side, side);
}

/** Salão em L: retângulo `width` × `depth` com o recorte no canto superior direito. */
export function createLShapeOutline(
  width: number,
  depth: number,
  cutWidth: number,
  cutDepth: number,
): RoomPoint[] {
  if (cutWidth <= 0 || cutDepth <= 0 || cutWidth >= width || cutDepth >= depth)
    throw new Error('O recorte precisa ser menor que o salão.');
  return checkedOutline([
    { x: 0, y: 0 },
    { x: width - cutWidth, y: 0 },
    { x: width - cutWidth, y: cutDepth },
    { x: width, y: cutDepth },
    { x: width, y: depth },
    { x: 0, y: depth },
  ]);
}

export type WallDirection = 'right' | 'down' | 'left' | 'up';
export type WallInput = { direction: WallDirection; length: number };

const WALL_VECTORS: Record<WallDirection, RoomPoint> = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

/** Salão manual, descrito parede a parede. A última parede precisa voltar ao ponto inicial. */
export function createOutlineFromWalls(walls: readonly WallInput[]): RoomPoint[] {
  if (walls.length > RECEPTION_LIMITS.maxOutlinePoints)
    throw new Error(`O salão aceita até ${RECEPTION_LIMITS.maxOutlinePoints} paredes.`);
  let x = 0;
  let y = 0;
  const points: RoomPoint[] = walls.map((wall) => {
    if (!Number.isInteger(wall.length) || wall.length <= 0)
      throw new Error('Informe o comprimento de cada parede.');
    const point = { x, y };
    x += WALL_VECTORS[wall.direction].x * wall.length;
    y += WALL_VECTORS[wall.direction].y * wall.length;
    return point;
  });
  if (x !== 0 || y !== 0)
    throw new Error(
      `As paredes não fecham: a última termina a ${formatMeters(Math.abs(x))} m na horizontal e ${formatMeters(Math.abs(y))} m na vertical do início.`,
    );
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return checkedOutline(points.map((point) => ({ x: point.x - minX, y: point.y - minY })));
}

function outlineCenter(outline: readonly RoomPoint[]): RoomPoint {
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  return {
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

function doorFits(door: ReceptionDoor, outline: readonly RoomPoint[]): boolean {
  if (door.wall >= outline.length) return false;
  const start = outline[door.wall]!;
  const end = outline[(door.wall + 1) % outline.length]!;
  return door.offset + door.width <= Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

// Salão

/** Cria a planta da festa ou troca o contorno, removendo só as portas que deixam de caber. */
export function setRoomOutline(project: Project, outline: RoomPoint[]): Project {
  checkedOutline(outline);
  const current = project.reception;
  if (!current)
    return withReception(project, {
      room: { outline, doors: [], columns: [] },
      tables: [],
      items: [],
      tableAssignments: [],
    });
  return withReception(project, {
    ...current,
    room: {
      ...current.room,
      outline,
      doors: current.room.doors.filter((door) => doorFits(door, outline)),
    },
  });
}

/** Portas removidas ao trocar o contorno, para confirmar antes de aplicar. */
export function getRoomChangeImpact(project: Project, outline: RoomPoint[]): ReceptionDoor[] {
  return project.reception?.room.doors.filter((door) => !doorFits(door, outline)) ?? [];
}

export type DoorInput = Omit<ReceptionDoor, 'id' | 'opening'> &
  Partial<Pick<ReceptionDoor, 'opening'>>;

/** Sem `opening`, a porta abre para dentro. */
export function addDoor(project: Project, input: DoorInput): Project {
  const reception = requireReception(project);
  if (reception.room.doors.length >= RECEPTION_LIMITS.maxDoors)
    throw new Error(`Limite de ${RECEPTION_LIMITS.maxDoors} portas atingido.`);
  const door: ReceptionDoor = { opening: 'inward', ...input, id: createUuid() };
  if (!doorFits(door, reception.room.outline)) throw new Error('A porta não cabe nessa parede.');
  return withReception(project, {
    ...reception,
    room: { ...reception.room, doors: [...reception.room.doors, door] },
  });
}

export function removeDoor(project: Project, doorId: string): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    room: {
      ...reception.room,
      doors: removeById(reception.room.doors, doorId, 'Porta inexistente.'),
    },
  });
}

export type DoorPatch = Partial<Omit<ReceptionDoor, 'id'>>;

/** Muda parede, posição, largura ou abertura; a porta precisa continuar cabendo na parede. */
export function updateDoor(project: Project, doorId: string, patch: DoorPatch): Project {
  const reception = requireReception(project);
  const doors = replaceById(reception.room.doors, doorId, patch, 'Porta inexistente.');
  if (
    !doorFits(
      doors.find((door) => door.id === doorId)!,
      reception.room.outline,
    )
  )
    throw new Error('A porta não cabe nessa parede.');
  return withReception(project, { ...reception, room: { ...reception.room, doors } });
}

const wallLength = (start: RoomPoint, end: RoomPoint) =>
  Math.abs(end.x - start.x) + Math.abs(end.y - start.y);

/** Orientação do contorno: 1 quando a área com sinal (eixo y para baixo) é positiva. */
function outlineOrientation(outline: readonly RoomPoint[]): 1 | -1 {
  let area = 0;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!;
    const b = outline[(index + 1) % outline.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area >= 0 ? 1 : -1;
}

/**
 * Geometria da porta na planta: vão de `start` a `end`, direção unitária da parede e normal
 * unitária apontando para dentro do salão. `null` se a parede não existir.
 */
export type DoorGeometry = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  along: { x: number; y: number };
  inward: { x: number; y: number };
};

export function getDoorGeometry(
  outline: readonly RoomPoint[],
  door: Pick<ReceptionDoor, 'wall' | 'offset' | 'width'>,
): DoorGeometry | null {
  const wallStart = outline[door.wall];
  const wallEnd = outline[(door.wall + 1) % outline.length];
  if (!wallStart || !wallEnd || wallLength(wallStart, wallEnd) === 0) return null;
  const along = { x: Math.sign(wallEnd.x - wallStart.x), y: Math.sign(wallEnd.y - wallStart.y) };
  const orientation = outlineOrientation(outline);
  return {
    start: { x: wallStart.x + along.x * door.offset, y: wallStart.y + along.y * door.offset },
    end: {
      x: wallStart.x + along.x * (door.offset + door.width),
      y: wallStart.y + along.y * (door.offset + door.width),
    },
    along,
    // Com y para baixo e área positiva, o interior fica à direita de quem percorre a parede.
    inward: { x: -along.y * orientation || 0, y: along.x * orientation || 0 },
  };
}

/**
 * Parede e distância do início para uma porta de `width` centrada o mais perto possível de
 * `point`, encaixada na grade e sempre inteira dentro da parede. Paredes mais curtas que a
 * porta são ignoradas; `null` se nenhuma couber.
 */
export function placeDoorNear(
  outline: readonly RoomPoint[],
  point: { x: number; y: number },
  width: number,
): { wall: number; offset: number } | null {
  let best: { wall: number; offset: number; distance: number } | null = null;
  for (let wall = 0; wall < outline.length; wall++) {
    const start = outline[wall]!;
    const end = outline[(wall + 1) % outline.length]!;
    const length = wallLength(start, end);
    if (length < width) continue;
    const along = { x: Math.sign(end.x - start.x), y: Math.sign(end.y - start.y) };
    const projected = (point.x - start.x) * along.x + (point.y - start.y) * along.y;
    const maxOffset = length - width;
    const snapped = Math.round((projected - width / 2) / GRID_CM) * GRID_CM;
    const offset = Math.max(0, Math.min(maxOffset, snapped));
    const center = offset + width / 2;
    const distance = Math.hypot(
      start.x + along.x * center - point.x,
      start.y + along.y * center - point.y,
    );
    if (!best || distance < best.distance) best = { wall, offset, distance };
  }
  return best && { wall: best.wall, offset: best.offset };
}

export function addColumn(project: Project, column: Omit<ReceptionColumn, 'id'>): Project {
  const reception = requireReception(project);
  if (reception.room.columns.length >= RECEPTION_LIMITS.maxColumns)
    throw new Error(`Limite de ${RECEPTION_LIMITS.maxColumns} colunas atingido.`);
  return withReception(project, {
    ...reception,
    room: {
      ...reception.room,
      columns: [...reception.room.columns, { ...column, id: createUuid() }],
    },
  });
}

export function updateColumn(
  project: Project,
  columnId: string,
  patch: Partial<Omit<ReceptionColumn, 'id'>>,
): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    room: {
      ...reception.room,
      columns: replaceById(reception.room.columns, columnId, patch, 'Coluna inexistente.'),
    },
  });
}

export function removeColumn(project: Project, columnId: string): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    room: {
      ...reception.room,
      columns: removeById(reception.room.columns, columnId, 'Coluna inexistente.'),
    },
  });
}

// Mesas

function nextTableName(tables: readonly ReceptionTable[]): string {
  const names = new Set(tables.map((table) => table.name));
  let number = tables.length + 1;
  while (names.has(`Mesa ${number}`)) number++;
  return `Mesa ${number}`;
}

const copyName = (name: string) => `${name.slice(0, RECEPTION_LIMITS.maxNameLength - 8)} (cópia)`;

export function addTable(
  project: Project,
  input: Partial<Omit<ReceptionTable, 'id'>> = {},
): Project {
  const reception = requireReception(project);
  if (reception.tables.length >= RECEPTION_LIMITS.maxTables)
    throw new Error(`Limite de ${RECEPTION_LIMITS.maxTables} mesas atingido.`);
  const center = outlineCenter(reception.room.outline);
  const table: ReceptionTable = {
    name: nextTableName(reception.tables),
    shape: 'round',
    x: center.x,
    y: center.y,
    rotation: 0,
    width: 150,
    depth: 150,
    seats: 8,
    ...input,
    id: createUuid(),
  };
  return withReception(project, { ...reception, tables: [...reception.tables, table] });
}

type TablePatch = Partial<
  Pick<ReceptionTable, 'name' | 'shape' | 'x' | 'y' | 'rotation' | 'width' | 'depth'>
>;

/** Quantidade de cadeiras muda só por `setTableSeats`, que trata quem perde o lugar. */
export function updateTable(project: Project, tableId: string, patch: TablePatch): Project {
  const reception = requireReception(project);
  const current = reception.tables.find((table) => table.id === tableId);
  if (!current) throw new Error('Mesa inexistente.');
  const next: TablePatch = { ...patch };
  if ((patch.shape ?? current.shape) === 'round') {
    const diameter = patch.width ?? patch.depth ?? current.width;
    next.width = diameter;
    next.depth = diameter;
  }
  return withReception(project, {
    ...reception,
    tables: replaceById(reception.tables, tableId, next, 'Mesa inexistente.'),
  });
}

/** Duplica a mesa sem os convidados: uma pessoa não pode ocupar duas mesas. */
export function duplicateTable(project: Project, tableId: string): Project {
  const reception = requireReception(project);
  const source = reception.tables.find((table) => table.id === tableId);
  if (!source) throw new Error('Mesa inexistente.');
  return addTable(project, {
    ...source,
    name: copyName(source.name),
    x: snapToGrid(source.x + 50),
    y: snapToGrid(source.y + 50),
  });
}

export function getTableGuestIds(project: Project, tableId: string): string[] {
  return (project.reception?.tableAssignments ?? [])
    .filter((assignment) => assignment.tableId === tableId)
    .map((assignment) => assignment.guestId);
}

export function getGuestTableId(project: Project, guestId: string): string | undefined {
  return project.reception?.tableAssignments.find((a) => a.guestId === guestId)?.tableId;
}

/** Remove a mesa; os convidados dela continuam na lista, sem mesa. */
export function removeTable(project: Project, tableId: string): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    tables: removeById(reception.tables, tableId, 'Mesa inexistente.'),
    tableAssignments: reception.tableAssignments.filter((a) => a.tableId !== tableId),
  });
}

/** Convidados que ficariam sem mesa ao reduzir as cadeiras, para confirmar antes de aplicar. */
export function getTableSeatReductionImpact(
  project: Project,
  tableId: string,
  seats: number,
): string[] {
  return getTableGuestIds(project, tableId).slice(seats);
}

export function setTableSeats(project: Project, tableId: string, seats: number): Project {
  const reception = requireReception(project);
  const displaced = new Set(getTableSeatReductionImpact(project, tableId, seats));
  return withReception(project, {
    ...reception,
    tables: replaceById(reception.tables, tableId, { seats }, 'Mesa inexistente.'),
    tableAssignments: reception.tableAssignments.filter((a) => !displaced.has(a.guestId)),
  });
}

/** Coloca o convidado na mesa, tirando-o da anterior. Passar da capacidade gera aviso. */
export function assignGuestToTable(project: Project, guestId: string, tableId: string): Project {
  const reception = requireReception(project);
  if (!project.guests.some((guest) => guest.id === guestId))
    throw new Error('Convidado inexistente.');
  if (!reception.tables.some((table) => table.id === tableId)) throw new Error('Mesa inexistente.');
  if (getGuestTableId(project, guestId) === tableId) return project;
  return withReception(project, {
    ...reception,
    tableAssignments: [
      ...reception.tableAssignments.filter((a) => a.guestId !== guestId),
      { tableId, guestId },
    ],
  });
}

export function unassignGuestFromTable(project: Project, guestId: string): Project {
  const reception = requireReception(project);
  if (!reception.tableAssignments.some((a) => a.guestId === guestId)) return project;
  return withReception(project, {
    ...reception,
    tableAssignments: reception.tableAssignments.filter((a) => a.guestId !== guestId),
  });
}

// Elementos

export function addItem(
  project: Project,
  kind: ReceptionItemKind,
  input: Partial<Omit<ReceptionItem, 'id' | 'kind'>> = {},
): Project {
  const reception = requireReception(project);
  if (reception.items.length >= RECEPTION_LIMITS.maxItems)
    throw new Error(`Limite de ${RECEPTION_LIMITS.maxItems} elementos atingido.`);
  const defaults = RECEPTION_ITEM_DEFAULTS[kind];
  const name = input.name ?? defaults.name;
  if (!name.trim()) throw new Error('Dê um nome ao item.');
  const center = outlineCenter(reception.room.outline);
  const item: ReceptionItem = {
    x: center.x,
    y: center.y,
    rotation: 0,
    width: defaults.width,
    depth: defaults.depth,
    ...input,
    name,
    kind,
    id: createUuid(),
  };
  return withReception(project, { ...reception, items: [...reception.items, item] });
}

export function updateItem(
  project: Project,
  itemId: string,
  patch: Partial<Omit<ReceptionItem, 'id' | 'kind'>>,
): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    items: replaceById(reception.items, itemId, patch, 'Elemento inexistente.'),
  });
}

export function duplicateItem(project: Project, itemId: string): Project {
  const reception = requireReception(project);
  const source = reception.items.find((item) => item.id === itemId);
  if (!source) throw new Error('Elemento inexistente.');
  return addItem(project, source.kind, {
    ...source,
    name: copyName(source.name),
    x: snapToGrid(source.x + 50),
    y: snapToGrid(source.y + 50),
  });
}

export function removeItem(project: Project, itemId: string): Project {
  const reception = requireReception(project);
  return withReception(project, {
    ...reception,
    items: removeById(reception.items, itemId, 'Elemento inexistente.'),
  });
}

// Geometria

type Point = { x: number; y: number };
type Shape = { type: 'circle'; center: Point; radius: number } | { type: 'poly'; points: Point[] };
type Bounds = { left: number; right: number; top: number; bottom: number };

function rotate(x: number, y: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function rotatedRect(center: Point, width: number, depth: number, rotation: number): Shape {
  const halfW = width / 2;
  const halfD = depth / 2;
  return {
    type: 'poly',
    points: [
      [-halfW, -halfD],
      [halfW, -halfD],
      [halfW, halfD],
      [-halfW, halfD],
    ].map(([x, y]) => {
      const offset = rotate(x!, y!, rotation);
      return { x: center.x + offset.x, y: center.y + offset.y };
    }),
  };
}

/** Posição derivada de cada cadeira; retangular distribui nos dois lados maiores. */
export function getTableSeatPositions(table: ReceptionTable): Point[] {
  if (table.shape === 'round') {
    const radius = table.width / 2 + CHAIR_OFFSET_CM;
    return Array.from({ length: table.seats }, (_, index) => {
      const offset = rotate(0, -radius, (index * 360) / table.seats + table.rotation);
      return { x: table.x + offset.x, y: table.y + offset.y };
    });
  }
  const alongWidth = table.width >= table.depth;
  const length = alongWidth ? table.width : table.depth;
  const across = (alongWidth ? table.depth : table.width) / 2 + CHAIR_OFFSET_CM;
  const firstSide = Math.ceil(table.seats / 2);
  return Array.from({ length: table.seats }, (_, index) => {
    const onFirst = index < firstSide;
    const sideCount = onFirst ? firstSide : table.seats - firstSide;
    const sideIndex = onFirst ? index : index - firstSide;
    const along = ((sideIndex + 1) / (sideCount + 1) - 0.5) * length;
    const side = onFirst ? -across : across;
    const offset = alongWidth
      ? rotate(along, side, table.rotation)
      : rotate(side, along, table.rotation);
    return { x: table.x + offset.x, y: table.y + offset.y };
  });
}

function tableBody(table: ReceptionTable): Shape {
  return table.shape === 'round'
    ? { type: 'circle', center: table, radius: table.width / 2 }
    : rotatedRect(table, table.width, table.depth, table.rotation);
}

function tableFootprint(table: ReceptionTable): Shape {
  if (table.shape === 'round')
    return { type: 'circle', center: table, radius: table.width / 2 + CHAIR_RING_CM };
  const ring = CHAIR_RING_CM * 2;
  return table.width >= table.depth
    ? rotatedRect(table, table.width, table.depth + ring, table.rotation)
    : rotatedRect(table, table.width + ring, table.depth, table.rotation);
}

function boundsOf(shape: Shape): Bounds {
  if (shape.type === 'circle')
    return {
      left: shape.center.x - shape.radius,
      right: shape.center.x + shape.radius,
      top: shape.center.y - shape.radius,
      bottom: shape.center.y + shape.radius,
    };
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function boundsApart(a: Bounds, b: Bounds, margin: number): boolean {
  return (
    a.right + margin <= b.left ||
    b.right + margin <= a.left ||
    a.bottom + margin <= b.top ||
    b.bottom + margin <= a.top
  );
}

function pointToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function edgesOf(points: readonly Point[]): [Point, Point][] {
  return points.map((point, index) => [point, points[(index + 1) % points.length]!]);
}

function pointToPolyEdges(point: Point, points: readonly Point[]): number {
  let best = Infinity;
  for (const [start, end] of edgesOf(points))
    best = Math.min(best, pointToSegment(point, start, end));
  return best;
}

function insideConvex(point: Point, points: readonly Point[]): boolean {
  let sign = 0;
  for (const [start, end] of edgesOf(points)) {
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    if (Math.abs(cross) <= EPSILON) return false;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

function polygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const [start, end] of [...edgesOf(a), ...edgesOf(b)]) {
    const axis = { x: start.y - end.y, y: end.x - start.x };
    if (axis.x === 0 && axis.y === 0) continue;
    const project = (points: readonly Point[]) => {
      const values = points.map((point) => point.x * axis.x + point.y * axis.y);
      return { min: Math.min(...values), max: Math.max(...values) };
    };
    const first = project(a);
    const second = project(b);
    if (first.max <= second.min + EPSILON || second.max <= first.min + EPSILON) return false;
  }
  return true;
}

function circlePolyOverlap(center: Point, radius: number, points: readonly Point[]): boolean {
  return (
    (points.length > 2 && insideConvex(center, points)) ||
    pointToPolyEdges(center, points) < radius - EPSILON
  );
}

function shapesOverlap(a: Shape, b: Shape): boolean {
  if (a.type === 'circle' && b.type === 'circle')
    return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < a.radius + b.radius;
  if (a.type === 'circle' && b.type === 'poly')
    return circlePolyOverlap(a.center, a.radius, b.points);
  if (a.type === 'poly' && b.type === 'circle')
    return circlePolyOverlap(b.center, b.radius, a.points);
  return polygonsOverlap((a as { points: Point[] }).points, (b as { points: Point[] }).points);
}

/** Folga entre as formas, zero se elas se sobrepõem. */
function shapeGap(a: Shape, b: Shape): number {
  if (shapesOverlap(a, b)) return 0;
  if (a.type === 'circle' && b.type === 'circle')
    return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) - a.radius - b.radius;
  if (a.type === 'circle' && b.type === 'poly')
    return pointToPolyEdges(a.center, b.points) - a.radius;
  if (a.type === 'poly' && b.type === 'circle')
    return pointToPolyEdges(b.center, a.points) - b.radius;
  const first = (a as { points: Point[] }).points;
  const second = (b as { points: Point[] }).points;
  let best = Infinity;
  for (const point of first) best = Math.min(best, pointToPolyEdges(point, second));
  for (const point of second) best = Math.min(best, pointToPolyEdges(point, first));
  return best;
}

function onBoundaryOrInside(point: Point, outline: readonly Point[]): boolean {
  let inside = false;
  for (const [start, end] of edgesOf(outline)) {
    if (pointToSegment(point, start, end) <= EPSILON) return true;
    if (
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    )
      inside = !inside;
  }
  return inside;
}

function properlyCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (from: Point, to: Point, point: Point) =>
    (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  const ab1 = side(a, b, c);
  const ab2 = side(a, b, d);
  const cd1 = side(c, d, a);
  const cd2 = side(c, d, b);
  return (
    Math.abs(ab1) > EPSILON &&
    Math.abs(ab2) > EPSILON &&
    Math.abs(cd1) > EPSILON &&
    Math.abs(cd2) > EPSILON &&
    Math.sign(ab1) !== Math.sign(ab2) &&
    Math.sign(cd1) !== Math.sign(cd2)
  );
}

function shapeInsideRoom(shape: Shape, outline: readonly Point[]): boolean {
  if (shape.type === 'circle')
    return (
      onBoundaryOrInside(shape.center, outline) &&
      pointToPolyEdges(shape.center, outline) >= shape.radius - EPSILON
    );
  if (!shape.points.every((point) => onBoundaryOrInside(point, outline))) return false;
  if (outline.some((point) => insideConvex(point, shape.points))) return false;
  for (const [a, b] of edgesOf(shape.points))
    for (const [c, d] of edgesOf(outline)) if (properlyCross(a, b, c, d)) return false;
  return true;
}

// Avisos

export type ReceptionElementRef = { kind: 'table' | 'item' | 'column'; id: string };

export type ReceptionWarning =
  | { code: 'outside_room'; element: ReceptionElementRef }
  | { code: 'overlap'; first: ReceptionElementRef; second: ReceptionElementRef }
  | {
      code: 'narrow_passage';
      first: ReceptionElementRef;
      /** `null` quando a passagem é entre o elemento e a parede. */
      second: ReceptionElementRef | null;
      gap: number;
    }
  | { code: 'table_over_capacity'; tableId: string; seats: number; guests: number };

type Element = {
  ref: ReceptionElementRef;
  body: Shape;
  footprint: Shape;
  bounds: Bounds;
  walkable: boolean;
};

function collectElements(reception: Reception): Element[] {
  const build = (ref: ReceptionElementRef, body: Shape, footprint: Shape, walkable: boolean) => ({
    ref,
    body,
    footprint,
    bounds: boundsOf(footprint),
    walkable,
  });
  return [
    ...reception.tables.map((table) =>
      build({ kind: 'table', id: table.id }, tableBody(table), tableFootprint(table), false),
    ),
    ...reception.items.map((item) => {
      const shape = rotatedRect(item, item.width, item.depth, item.rotation);
      return build({ kind: 'item', id: item.id }, shape, shape, WALKABLE_KINDS.has(item.kind));
    }),
    ...reception.room.columns.map((column) => {
      const shape = rotatedRect(column, column.width, column.depth, 0);
      return build({ kind: 'column', id: column.id }, shape, shape, false);
    }),
  ];
}

/** Avisos indicativos: nenhum deles bloqueia a edição. */
export function getReceptionWarnings(reception: Reception): ReceptionWarning[] {
  const warnings: ReceptionWarning[] = [];
  const outline = reception.room.outline;
  const walls = edgesOf(outline).map<Shape>(([start, end]) => ({
    type: 'poly',
    points: [start, end],
  }));
  const elements = collectElements(reception);

  for (const element of elements) {
    if (element.ref.kind === 'column') continue;
    if (!shapeInsideRoom(element.body, outline)) {
      warnings.push({ code: 'outside_room', element: element.ref });
      continue;
    }
    if (element.walkable) continue;
    let gap = Infinity;
    for (const wall of walls) gap = Math.min(gap, shapeGap(element.footprint, wall));
    const flush = element.ref.kind !== 'table' && gap <= FLUSH_CM;
    if (gap < MIN_PASSAGE_CM && !flush)
      warnings.push({
        code: 'narrow_passage',
        first: element.ref,
        second: null,
        gap: Math.round(gap),
      });
  }

  for (let a = 0; a < elements.length; a++) {
    const first = elements[a]!;
    for (let b = a + 1; b < elements.length; b++) {
      const second = elements[b]!;
      if (first.ref.kind === 'column' && second.ref.kind === 'column') continue;
      if (boundsApart(first.bounds, second.bounds, MIN_PASSAGE_CM)) continue;
      if (shapesOverlap(first.body, second.body)) {
        warnings.push({ code: 'overlap', first: first.ref, second: second.ref });
        continue;
      }
      if (first.walkable || second.walkable) continue;
      const gap = shapeGap(first.footprint, second.footprint);
      const flush = first.ref.kind !== 'table' && second.ref.kind !== 'table' && gap <= FLUSH_CM;
      if (gap < MIN_PASSAGE_CM && !flush)
        warnings.push({
          code: 'narrow_passage',
          first: first.ref,
          second: second.ref,
          gap: Math.round(gap),
        });
    }
  }

  const occupancy = new Map<string, number>();
  for (const { tableId } of reception.tableAssignments)
    occupancy.set(tableId, (occupancy.get(tableId) ?? 0) + 1);
  for (const table of reception.tables) {
    const guests = occupancy.get(table.id) ?? 0;
    if (guests > table.seats)
      warnings.push({ code: 'table_over_capacity', tableId: table.id, seats: table.seats, guests });
  }
  return warnings;
}
