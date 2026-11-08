import { describe, expect, it } from 'vitest';
import {
  createDemoDocument,
  parseProjectFile,
  projectDocumentSchema,
  type ProjectDocument,
} from '../src/index.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function document(): ProjectDocument {
  return projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 1,
    exportedAt: '2026-11-07T12:00:00.000Z',
    project: {
      title: 'Cerimônia',
      couple: { first: 'Ana', second: 'João' },
      weddingDate: '2028-02-29',
      layout: {
        mode: 'straight',
        curveStrength: 0,
        aisleWidth: 1.8,
        linkedCounts: true,
        rows: [{ id: id(1), leftSeatIds: [id(2)], rightSeatIds: [] }],
      },
      guests: [{ id: id(3), name: 'Lia', category: 'familia', note: '' }],
      assignments: [{ seatId: id(2), guestId: id(3) }],
    },
  });
}
const parse = (v: unknown) => parseProjectFile(JSON.stringify(v));

describe('@enlace/contracts', () => {
  it('faz roundtrip do documento portátil', () => expect(parse(document())).toEqual(document()));
  it('gera demonstração fictícia com 55 cadeiras', () =>
    expect(
      createDemoDocument().project.layout.rows.flatMap((r) => [
        ...r.leftSeatIds,
        ...r.rightSeatIds,
      ]),
    ).toHaveLength(55));
  it('rejeita versão futura', () =>
    expect(() => parse({ format: 'enlace-project', schemaVersion: 99 })).toThrow(/não suportada/));
  it('rejeita IDs duplicados de cadeiras', () => {
    const v = document();
    v.project.layout.rows[0].rightSeatIds = [id(2)];
    expect(() => parse(v)).toThrow();
  });
  it('rejeita referências ausentes e atribuições duplicadas', () => {
    const v = document();
    v.project.assignments = [{ seatId: id(88), guestId: id(3) }];
    expect(() => parse(v)).toThrow();
    v.project.assignments = [
      { seatId: id(2), guestId: id(3) },
      { seatId: id(2), guestId: id(3) },
    ];
    expect(() => parse(v)).toThrow();
  });
  it('rejeita data inexistente e arquivo maior que 2 MiB', () => {
    const v = document();
    v.project.weddingDate = '2027-02-29';
    expect(() => parse(v)).toThrow();
    expect(() => parseProjectFile(' '.repeat(2 * 1024 * 1024 + 1))).toThrow(/2 MiB/);
  });
  it('migra v3 preservando assimetria, acentos e vínculo canônico', () => {
    const migrated = parse({
      version: 3,
      couple: { first: 'Íris', second: 'João' },
      mode: 'curve',
      rows: [[1, 2]],
      people: [{ id: 'old-1', name: 'Lúcia', group: 'familia', note: 'avó' }],
      assignments: { 'R-0-1': 'old-1' },
    });
    expect(migrated.project.couple.first).toBe('Íris');
    expect(migrated.project.layout.rows[0].leftSeatIds).toHaveLength(1);
    expect(migrated.project.layout.rows[0].rightSeatIds).toHaveLength(2);
    expect(migrated.project.assignments).toHaveLength(1);
    expect(migrated.project.guests[0].name).toBe('Lúcia');
  });
  it('recusa atribuição v3 para posição não canônica ou referência inválida', () => {
    const base = {
      version: 3,
      mode: 'straight',
      rows: [[1, 0]],
      people: [{ id: 'p', name: 'Lia', group: 'convidado' }],
      assignments: {},
    };
    expect(() => parse({ ...base, assignments: { 'L-00-0': 'p' } })).toThrow();
    expect(() => parse({ ...base, assignments: { 'L-0-0': 'missing' } })).toThrow();
  });
  it('mapeia campos v3 opcionais ausentes e data vazia para defaults neutros', () => {
    const migrated = parse({
      version: 3,
      mode: 'straight',
      rows: [[1, 0]],
      people: [],
      assignments: {},
      weddingDate: '',
    });
    expect(migrated.project).toMatchObject({
      title: 'Meu projeto',
      couple: { first: '', second: '' },
      weddingDate: null,
    });
    expect(migrated.project.layout).toMatchObject({
      aisleWidth: 1.8,
      linkedCounts: true,
      curveStrength: 50,
    });
  });
  it('valida formato v3 completo e rejeita tipos, IDs, nomes, aliases e chaves desconhecidos', () => {
    const base = {
      version: 3,
      mode: 'straight',
      rows: [[1, 0]],
      people: [{ id: 'p', name: 'Lia', group: 'convidado' }],
      assignments: {},
    };
    expect(() => parse({ ...base, people: undefined })).toThrow();
    expect(() => parse({ ...base, assignments: [] })).toThrow();
    expect(() => parse({ ...base, rows: '1,0' })).toThrow();
    expect(() =>
      parse({ ...base, people: [{ id: ' ', name: 'Lia', group: 'convidado' }] }),
    ).toThrow();
    expect(() =>
      parse({ ...base, people: [{ id: 'p', name: '   ', group: 'convidado' }] }),
    ).toThrow();
    expect(() => parse({ ...base, people: [{ id: 'p', name: 'Lia', group: 'guest' }] })).toThrow();
    expect(() => parse({ ...base, ignored: true })).toThrow();
  });
  it('rejeita título e nome somente com espaços no novo contrato', () => {
    const v = document();
    v.project.title = '   ';
    expect(() => parse(v)).toThrow();
    v.project.title = 'Cerimônia';
    v.project.guests[0].name = '   ';
    expect(() => parse(v)).toThrow();
  });
});
