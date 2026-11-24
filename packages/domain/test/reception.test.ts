import { describe, expect, it } from 'vitest';
import { projectSchema, type Project } from '@enlace/contracts';
import { createInitialProject, createSampleProject, removeGuest } from '../src/index.js';
import {
  CHAIR_RING_CM,
  addColumn,
  addDoor,
  addItem,
  addTable,
  assignGuestToTable,
  createLShapeOutline,
  createOutlineFromWalls,
  createRectangleOutline,
  createSquareOutline,
  duplicateItem,
  duplicateTable,
  formatMeters,
  getDoorGeometry,
  getGuestTableId,
  getReceptionWarnings,
  getRoomChangeImpact,
  getTableGuestIds,
  getTableSeatPositions,
  getTableSeatReductionImpact,
  normalizeRotation,
  parseMeters,
  placeDoorNear,
  removeDoor,
  removeTable,
  setRoomOutline,
  setTableSeats,
  snapToGrid,
  unassignGuestFromTable,
  updateDoor,
  updateItem,
  updateTable,
} from '../src/reception.js';

const room = (width = 2000, depth = 1000): Project =>
  setRoomOutline(createSampleProject(), createRectangleOutline(width, depth));
const lastTable = (project: Project) => project.reception!.tables.at(-1)!;
const lastItem = (project: Project) => project.reception!.items.at(-1)!;
const warnings = (project: Project) => getReceptionWarnings(project.reception!);
const codes = (project: Project) => warnings(project).map((warning) => warning.code);

describe('medidas', () => {
  it('converte metros com vírgula ou ponto em centímetros exatos', () => {
    expect(parseMeters('3,5')).toBe(350);
    expect(parseMeters('3.05')).toBe(305);
    expect(parseMeters(' 12 ')).toBe(1200);
    expect(parseMeters('0,07')).toBe(7);
    expect(parseMeters('1,234')).toBeNull();
    expect(parseMeters('abc')).toBeNull();
    expect(parseMeters('-1')).toBeNull();
    expect(formatMeters(350)).toBe('3,5');
  });

  it('encaixa em 10 cm dentro dos limites e normaliza rotação', () => {
    expect(snapToGrid(123)).toBe(120);
    expect(snapToGrid(-40)).toBe(0);
    expect(snapToGrid(20_000)).toBe(10_000);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
  });
});

describe('contornos', () => {
  it('gera formatos prontos como o mesmo polígono', () => {
    expect(createSquareOutline(800)).toEqual(createRectangleOutline(800, 800));
    expect(createLShapeOutline(1000, 800, 400, 300)).toHaveLength(6);
  });

  it('recusa L com recorte maior que o salão', () => {
    expect(() => createLShapeOutline(1000, 800, 1000, 300)).toThrow(/recorte/);
  });

  it('cria salão manual parede a parede, com origem em zero', () => {
    expect(
      createOutlineFromWalls([
        { direction: 'left', length: 500 },
        { direction: 'down', length: 300 },
        { direction: 'right', length: 500 },
        { direction: 'up', length: 300 },
      ]),
    ).toEqual([
      { x: 500, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 500, y: 300 },
    ]);
  });

  it('explica em metros quando as paredes não fecham e recusa cruzamento', () => {
    expect(() =>
      createOutlineFromWalls([
        { direction: 'right', length: 500 },
        { direction: 'down', length: 300 },
        { direction: 'left', length: 450 },
        { direction: 'up', length: 300 },
      ]),
    ).toThrow(/0,5 m na horizontal/);
    expect(() =>
      createOutlineFromWalls([
        { direction: 'right', length: 500 },
        { direction: 'right', length: 500 },
      ]),
    ).toThrow();
  });

  it('salão inválido não altera o projeto', () => {
    const project = room();
    const before = JSON.stringify(project);
    expect(() => setRoomOutline(project, [{ x: 0, y: 0 }])).toThrow(/4 paredes/);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('trocar o contorno remove só as portas que deixam de caber', () => {
    let project = addDoor(room(), { wall: 0, offset: 1500, width: 100 });
    project = addDoor(project, { wall: 0, offset: 100, width: 100 });
    const smaller = createRectangleOutline(1000, 1000);
    expect(getRoomChangeImpact(project, smaller)).toHaveLength(1);
    const next = setRoomOutline(project, smaller);
    expect(next.reception!.room.doors).toHaveLength(1);
    expect(next.reception!.room.doors[0]!.offset).toBe(100);
  });
});

describe('portas', () => {
  it('nova porta abre para dentro e muda de abertura, parede e posição', () => {
    let project = addDoor(room(), { wall: 0, offset: 100, width: 100 });
    const door = project.reception!.room.doors[0]!;
    expect(door.opening).toBe('inward');
    project = updateDoor(project, door.id, { opening: 'sliding' });
    project = updateDoor(project, door.id, { wall: 1, offset: 300 });
    expect(project.reception!.room.doors[0]).toMatchObject({
      opening: 'sliding',
      wall: 1,
      offset: 300,
    });
    expect(projectSchema.parse(project)).toBeTruthy();
    expect(removeDoor(project, door.id).reception!.room.doors).toHaveLength(0);
  });

  it('recusa porta que deixa de caber ou inexistente', () => {
    const project = addDoor(room(), { wall: 1, offset: 0, width: 100 });
    const id = project.reception!.room.doors[0]!.id;
    expect(() => updateDoor(project, id, { offset: 950 })).toThrow(/não cabe/);
    expect(() => updateDoor(project, 'x', { offset: 0 })).toThrow(/inexistente/);
  });

  it('encaixa a porta na parede mais próxima, na grade e dentro da parede', () => {
    const outline = createRectangleOutline(2000, 1000);
    expect(placeDoorNear(outline, { x: 503, y: 40 }, 100)).toEqual({ wall: 0, offset: 450 });
    expect(placeDoorNear(outline, { x: 1960, y: 700 }, 100)).toEqual({ wall: 1, offset: 650 });
    // Perto do canto: a porta fica inteira na parede.
    expect(placeDoorNear(outline, { x: 1990, y: 10 }, 120)).toEqual({ wall: 0, offset: 1880 });
    // Fora do salão também projeta na parede mais próxima.
    expect(placeDoorNear(outline, { x: -300, y: 500 }, 100)).toEqual({ wall: 3, offset: 450 });
    // Paredes curtas demais são ignoradas.
    expect(placeDoorNear(createRectangleOutline(100, 1000), { x: 50, y: 0 }, 200)).toMatchObject({
      wall: 1,
    });
  });

  it('geometria aponta a normal para dentro do salão nas duas orientações', () => {
    const outline = createRectangleOutline(2000, 1000);
    expect(getDoorGeometry(outline, { wall: 0, offset: 100, width: 100 })).toEqual({
      start: { x: 100, y: 0 },
      end: { x: 200, y: 0 },
      along: { x: 1, y: 0 },
      inward: { x: 0, y: 1 },
    });
    const reversed = [...outline].reverse();
    const geometry = getDoorGeometry(reversed, { wall: 0, offset: 0, width: 100 })!;
    // Parede de (0,1000) a (2000,1000): o interior fica acima.
    expect(geometry.inward).toEqual({ x: 0, y: -1 });
    expect(getDoorGeometry(outline, { wall: 9, offset: 0, width: 100 })).toBeNull();
  });
});

describe('mesas e convidados', () => {
  it('cria mesas numeradas e sem nomes repetidos após remover', () => {
    let project = addTable(addTable(room()));
    expect(lastTable(project).name).toBe('Mesa 2');
    project = removeTable(project, project.reception!.tables[0]!.id);
    expect(lastTable(addTable(project)).name).toBe('Mesa 3');
  });

  it('exige planta criada antes de adicionar mesa', () => {
    expect(() => addTable(createInitialProject())).toThrow(/planta da festa/);
  });

  it('mantém mesa redonda com largura e profundidade iguais', () => {
    const project = addTable(room());
    const next = updateTable(project, lastTable(project).id, { depth: 200 });
    expect(lastTable(next)).toMatchObject({ width: 200, depth: 200 });
  });

  it('nunca deixa um convidado em duas mesas', () => {
    let project = addTable(addTable(room()));
    const [first, second] = project.reception!.tables;
    const guestId = project.guests[0]!.id;
    project = assignGuestToTable(project, guestId, first!.id);
    project = assignGuestToTable(project, guestId, second!.id);
    expect(project.reception!.tableAssignments).toEqual([{ tableId: second!.id, guestId }]);
    expect(getGuestTableId(project, guestId)).toBe(second!.id);
  });

  it('atribuir de novo à mesma mesa devolve o mesmo objeto', () => {
    const base = addTable(room());
    const assigned = assignGuestToTable(base, base.guests[0]!.id, lastTable(base).id);
    expect(assignGuestToTable(assigned, base.guests[0]!.id, lastTable(base).id)).toBe(assigned);
  });

  it('recusa convidado ou mesa inexistente', () => {
    const project = addTable(room());
    expect(() => assignGuestToTable(project, crypto.randomUUID(), lastTable(project).id)).toThrow(
      /Convidado/,
    );
    expect(() => assignGuestToTable(project, project.guests[0]!.id, crypto.randomUUID())).toThrow(
      /Mesa/,
    );
  });

  it('apagar mesa mantém as pessoas na lista, sem mesa', () => {
    let project = addTable(room());
    const table = lastTable(project);
    project = assignGuestToTable(project, project.guests[0]!.id, table.id);
    const next = removeTable(project, table.id);
    expect(next.guests).toHaveLength(project.guests.length);
    expect(next.reception!.tableAssignments).toEqual([]);
  });

  it('reduzir cadeiras informa e retira só os excedentes', () => {
    let project = addTable(room());
    const table = lastTable(project);
    for (const guest of project.guests.slice(0, 3))
      project = assignGuestToTable(project, guest.id, table.id);
    const third = project.guests[2]!.id;
    expect(getTableSeatReductionImpact(project, table.id, 2)).toEqual([third]);
    const next = setTableSeats(project, table.id, 2);
    expect(getTableGuestIds(next, table.id)).toHaveLength(2);
    expect(getGuestTableId(next, third)).toBeUndefined();
    expect(next.guests).toHaveLength(project.guests.length);
  });

  it('retirar da mesa e remover convidado limpam a atribuição', () => {
    let project = addTable(room());
    const guestId = project.guests[0]!.id;
    project = assignGuestToTable(project, guestId, lastTable(project).id);
    expect(unassignGuestFromTable(project, guestId).reception!.tableAssignments).toEqual([]);
    const removed = removeGuest(project, guestId);
    expect(removed.reception!.tableAssignments).toEqual([]);
    expect(removed.assignments.some((a) => a.guestId === guestId)).toBe(false);
    expect(removed.guests.some((g) => g.id === guestId)).toBe(false);
  });

  it('duplica mesa sem levar os convidados', () => {
    let project = addTable(room(), { x: 500, y: 500 });
    project = assignGuestToTable(project, project.guests[0]!.id, lastTable(project).id);
    const next = duplicateTable(project, lastTable(project).id);
    expect(lastTable(next)).toMatchObject({ name: 'Mesa 1 (cópia)', x: 550, y: 550 });
    expect(getTableGuestIds(next, lastTable(next).id)).toEqual([]);
  });

  it('respeita os limites de mesas e elementos', () => {
    let project = room();
    for (let index = 0; index < 100; index++) project = addTable(project);
    expect(() => addTable(project)).toThrow(/100 mesas/);
    for (let index = 0; index < 60; index++) project = addItem(project, 'bar');
    expect(() => addItem(project, 'bar')).toThrow(/60 elementos/);
  });

  it('preserva o que não mudou', () => {
    const project = addTable(addTable(room()));
    const [first, second] = project.reception!.tables;
    const next = updateTable(project, first!.id, { x: 100 });
    expect(next.reception!.tables[1]).toBe(second);
    expect(next.guests).toBe(project.guests);
  });
});

describe('elementos', () => {
  it('usa medidas padrão e exige nome no item personalizado', () => {
    expect(lastItem(addItem(room(), 'dance_floor'))).toMatchObject({
      name: 'Pista de dança',
      width: 500,
      depth: 500,
    });
    expect(() => addItem(room(), 'custom')).toThrow(/nome/);
    expect(lastItem(addItem(room(), 'custom', { name: 'Cabine' })).name).toBe('Cabine');
  });

  it('duplica e edita elementos', () => {
    const project = addItem(room(), 'bar', { x: 300, y: 300 });
    const copy = duplicateItem(project, lastItem(project).id);
    expect(lastItem(copy)).toMatchObject({ kind: 'bar', name: 'Bar (cópia)', x: 350, y: 350 });
    expect(lastItem(updateItem(project, lastItem(project).id, { rotation: 90 })).rotation).toBe(90);
  });
});

describe('cadeiras derivadas', () => {
  const base = {
    id: crypto.randomUUID(),
    name: 'Mesa',
    x: 500,
    y: 500,
    rotation: 0,
  };

  it('distribui cadeiras em volta da mesa redonda', () => {
    const seats = getTableSeatPositions({
      ...base,
      shape: 'round',
      width: 150,
      depth: 150,
      seats: 8,
    });
    expect(seats).toHaveLength(8);
    for (const seat of seats) expect(Math.hypot(seat.x - 500, seat.y - 500)).toBeCloseTo(100);
  });

  it('distribui nos lados maiores e acompanha a rotação', () => {
    const table = { ...base, shape: 'rect' as const, width: 240, depth: 90, seats: 5 };
    const seats = getTableSeatPositions(table);
    expect(seats.filter((seat) => seat.y < 500)).toHaveLength(3);
    expect(seats.filter((seat) => seat.y > 500)).toHaveLength(2);
    const rotated = getTableSeatPositions({ ...table, rotation: 90 });
    expect(rotated.filter((seat) => seat.x > 500)).toHaveLength(3);
  });
});

describe('avisos', () => {
  it('não avisa em planta folgada', () => {
    let project = addTable(room(), { x: 500, y: 500 });
    project = addTable(project, { x: 1200, y: 500 });
    expect(warnings(project)).toEqual([]);
  });

  it('acusa elemento fora do salão, sem bloquear', () => {
    const project = addItem(room(), 'bar', { x: 1990, y: 500 });
    expect(codes(project)).toContain('outside_room');
  });

  it('acusa elemento no recorte do salão em L, mesmo com o centro fora', () => {
    const lShape = setRoomOutline(createSampleProject(), createLShapeOutline(1000, 1000, 400, 400));
    expect(codes(addItem(lShape, 'bar', { x: 800, y: 200 }))).toContain('outside_room');
  });

  it('acusa elemento atravessando o canto interno do L, com os cantos dentro', () => {
    const lShape = setRoomOutline(createSampleProject(), createLShapeOutline(1000, 1000, 400, 400));
    const project = addItem(lShape, 'custom', {
      name: 'Painel',
      x: 600,
      y: 400,
      width: 280,
      depth: 280,
      rotation: 45,
    });
    expect(codes(project)).toContain('outside_room');
  });

  it('acusa sobreposição entre mesas, mesa e item, e elemento e coluna', () => {
    let project = addTable(room(), { x: 500, y: 500 });
    project = addTable(project, { x: 550, y: 500 });
    expect(codes(project)).toContain('overlap');
    const withColumn = addColumn(addItem(room(), 'bar', { x: 600, y: 500 }), {
      x: 600,
      y: 500,
      width: 40,
      depth: 40,
    });
    expect(codes(withColumn)).toContain('overlap');
  });

  it('considera rotação na sobreposição', () => {
    const base = addItem(room(), 'custom', {
      name: 'A',
      x: 500,
      y: 500,
      width: 400,
      depth: 40,
    });
    const crossing = addItem(base, 'custom', {
      name: 'B',
      x: 500,
      y: 500,
      width: 400,
      depth: 40,
      rotation: 90,
    });
    expect(codes(crossing)).toContain('overlap');
  });

  it('acusa passagem estreita contando a faixa das cadeiras', () => {
    const radius = 75 + CHAIR_RING_CM;
    const gap = 60;
    let project = addTable(room(), { x: 500, y: 500 });
    project = addTable(project, { x: 500 + radius * 2 + gap, y: 500 });
    const warning = warnings(project).find((entry) => entry.code === 'narrow_passage');
    expect(warning).toMatchObject({ gap });
  });

  it('acusa passagem estreita entre mesa e parede', () => {
    const project = addTable(room(), { x: 180, y: 500 });
    expect(warnings(project)).toContainEqual(
      expect.objectContaining({ code: 'narrow_passage', second: null }),
    );
  });

  it('não avisa item encostado na parede ou em outro item', () => {
    let project = addItem(room(), 'cake_table', { x: 500, y: 40 });
    project = addItem(project, 'sweets_table', { x: 680, y: 40 });
    expect(codes(project)).toEqual([]);
  });

  it('pista de dança não forma passagem estreita, mas acusa sobreposição', () => {
    const floor = addItem(room(), 'dance_floor', { x: 1000, y: 500 });
    expect(codes(addTable(floor, { x: 1000 - 250 - 75 - CHAIR_RING_CM - 20, y: 500 }))).toEqual([]);
    expect(codes(addTable(floor, { x: 1000, y: 500 }))).toContain('overlap');
  });

  it('acusa mesa acima da capacidade', () => {
    let project = addTable(room(), { x: 500, y: 500, seats: 1 });
    const tableId = lastTable(project).id;
    for (const guest of project.guests.slice(0, 2))
      project = assignGuestToTable(project, guest.id, tableId);
    expect(warnings(project)).toContainEqual({
      code: 'table_over_capacity',
      tableId,
      seats: 1,
      guests: 2,
    });
  });

  it('o resultado continua válido no cenário máximo', () => {
    let project = room(10_000, 10_000);
    for (let index = 0; index < 100; index++)
      project = addTable(project, {
        x: 300 + (index % 10) * 400,
        y: 300 + Math.floor(index / 10) * 400,
      });
    for (let index = 0; index < 60; index++)
      project = addItem(project, 'bar', { x: 5000 + (index % 10) * 400, y: 300 + index * 100 });
    expect(() => projectSchema.parse(project)).not.toThrow();
    expect(Array.isArray(warnings(project))).toBe(true);
  });
});
