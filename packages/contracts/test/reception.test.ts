import { describe, expect, it } from 'vitest';
import {
  createDemoDocument,
  findRoomOutlineError,
  parseProjectFile,
  projectDocumentSchema,
  projectDocumentV1Schema,
  type ProjectDocument,
} from '../src/index.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rectangle = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
  { x: 2000, y: 1000 },
  { x: 0, y: 1000 },
];

function documentV2(): ProjectDocument {
  return projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 2,
    exportedAt: '2026-11-09T12:00:00.000Z',
    project: {
      title: 'Festa',
      couple: { first: 'Ana', second: 'João' },
      weddingDate: null,
      layout: {
        mode: 'straight',
        curveStrength: 0,
        aisleWidth: 1.8,
        linkedCounts: true,
        rows: [{ id: id(1), leftSeatIds: [id(2)], rightSeatIds: [] }],
      },
      guests: [{ id: id(3), name: 'Lia', category: 'familia', note: '' }],
      assignments: [{ seatId: id(2), guestId: id(3) }],
      reception: {
        room: {
          outline: rectangle,
          doors: [{ id: id(10), wall: 0, offset: 100, width: 120 }],
          columns: [{ id: id(11), x: 500, y: 500, width: 40, depth: 40 }],
        },
        tables: [
          {
            id: id(20),
            name: 'Mesa 1',
            shape: 'round',
            x: 600,
            y: 400,
            rotation: 0,
            width: 150,
            depth: 150,
            seats: 8,
          },
        ],
        items: [
          {
            id: id(30),
            kind: 'dj',
            name: 'DJ e som',
            x: 1500,
            y: 100,
            rotation: 90,
            width: 200,
            depth: 80,
          },
        ],
        tableAssignments: [{ tableId: id(20), guestId: id(3) }],
      },
    },
  });
}
const parse = (value: unknown) => parseProjectFile(JSON.stringify(value));

describe('contrato da festa', () => {
  it('faz roundtrip do documento v2', () => {
    expect(parse(documentV2())).toEqual(documentV2());
  });

  it('migra v1 sem perda, com reception nula e data de exportação preservada', () => {
    const { reception, ...ceremony } = createDemoDocument().project;
    expect(reception).toBeNull();
    const v1 = projectDocumentV1Schema.parse({
      format: 'enlace-project',
      schemaVersion: 1,
      exportedAt: '2026-11-01T10:00:00.000Z',
      project: ceremony,
    });
    const migrated = parse(v1);
    expect(migrated).toEqual({
      ...v1,
      schemaVersion: 2,
      project: { ...ceremony, reception: null },
    });
  });

  it('recusa v1 com reception: o campo só existe a partir do v2', () => {
    const { project } = documentV2();
    expect(() =>
      parse({
        format: 'enlace-project',
        schemaVersion: 1,
        exportedAt: '2026-11-01T10:00:00.000Z',
        project,
      }),
    ).toThrow();
  });

  it('migra v3 legado com reception nula', () => {
    const migrated = parse({
      version: 3,
      mode: 'straight',
      rows: [[1, 0]],
      people: [{ id: 'p', name: 'Lia', group: 'convidado' }],
      assignments: { 'L-0-0': 'p' },
    });
    expect(migrated.project.reception).toBeNull();
    expect(migrated.project.assignments).toHaveLength(1);
  });

  it('recusa versão futura, campo desconhecido e projeto sem reception', () => {
    expect(() => parse({ format: 'enlace-project', schemaVersion: 3 })).toThrow(/não suportada/);
    const extra = documentV2() as unknown as { project: Record<string, unknown> };
    extra.project.ownerId = 'outra-conta';
    expect(() => parse(extra)).toThrow();
    const missing = documentV2() as unknown as { project: Record<string, unknown> };
    delete missing.project.reception;
    expect(() => parse(missing)).toThrow();
  });

  it('recusa referências inválidas', () => {
    const unknownTable = documentV2();
    unknownTable.project.reception!.tableAssignments = [{ tableId: id(99), guestId: id(3) }];
    expect(() => parse(unknownTable)).toThrow();
    const unknownGuest = documentV2();
    unknownGuest.project.reception!.tableAssignments = [{ tableId: id(20), guestId: id(99) }];
    expect(() => parse(unknownGuest)).toThrow();
  });

  it('recusa convidado em duas mesas e IDs repetidos entre elementos', () => {
    const twice = documentV2();
    twice.project.reception!.tables.push({
      ...twice.project.reception!.tables[0]!,
      id: id(21),
    });
    twice.project.reception!.tableAssignments.push({ tableId: id(21), guestId: id(3) });
    expect(() => parse(twice)).toThrow();
    const sameId = documentV2();
    sameId.project.reception!.items[0]!.id = id(20);
    expect(() => parse(sameId)).toThrow();
  });

  it('recusa medidas fora dos limites e valores não inteiros', () => {
    const tooFar = documentV2();
    tooFar.project.reception!.tables[0]!.x = 10_001;
    expect(() => parse(tooFar)).toThrow();
    const fractional = documentV2();
    fractional.project.reception!.tables[0]!.x = 10.5;
    expect(() => parse(fractional)).toThrow();
    const seats = documentV2();
    seats.project.reception!.tables[0]!.seats = 25;
    expect(() => parse(seats)).toThrow();
    const oval = documentV2();
    oval.project.reception!.tables[0]!.depth = 120;
    expect(() => parse(oval)).toThrow();
  });

  it('recusa porta em parede inexistente ou maior que a parede', () => {
    const wall = documentV2();
    wall.project.reception!.room.doors[0]!.wall = 4;
    expect(() => parse(wall)).toThrow();
    const wide = documentV2();
    wide.project.reception!.room.doors[0]!.offset = 1950;
    expect(() => parse(wide)).toThrow();
  });

  it('aceita elemento fora do salão: isso é aviso, não erro de arquivo', () => {
    const outside = documentV2();
    outside.project.reception!.items[0]!.x = 9000;
    expect(parse(outside).project.reception!.items[0]!.x).toBe(9000);
  });

  it('valida contorno ortogonal, fechado e simples', () => {
    expect(findRoomOutlineError(rectangle)).toBeNull();
    expect(findRoomOutlineError(rectangle.slice(0, 3))).toMatch(/4 paredes/);
    expect(
      findRoomOutlineError([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ]),
    ).toMatch(/ângulo reto/);
    expect(
      findRoomOutlineError([
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 500 },
        { x: 200, y: 500 },
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 0, y: 800 },
      ]),
    ).toMatch(/cruzar/);
    expect(
      findRoomOutlineError([
        { x: 0, y: 0 },
        { x: 10_001, y: 0 },
        { x: 10_001, y: 100 },
        { x: 0, y: 100 },
      ]),
    ).toMatch(/100 × 100/);
    expect(
      findRoomOutlineError([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 100 },
        { x: 0, y: 100 },
      ]),
    ).toMatch(/10 cm/);
  });
});
