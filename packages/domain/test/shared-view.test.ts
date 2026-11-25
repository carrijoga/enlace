import { describe, expect, it } from 'vitest';
import type { CeremonyProject } from '@enlace/contracts';
import { assignGuest, createInitialProject, toSharedView } from '../src/index.js';
import {
  addTable,
  assignGuestToTable,
  createRectangleOutline,
  setRoomOutline,
} from '../src/reception.js';

const NOTE = 'observacao-secreta-123';
const TITLE = 'titulo-privado-xyz';

function projectWithGuests() {
  let project: CeremonyProject = {
    ...createInitialProject(),
    title: TITLE,
    couple: { first: 'Alex', second: 'Ravi' },
    weddingDate: '2027-05-01',
    guests: [
      { id: crypto.randomUUID(), name: 'Pessoa Sentada', category: 'padrinho', note: NOTE },
      { id: crypto.randomUUID(), name: 'Outra Sentada', category: 'familia', note: '' },
      { id: crypto.randomUUID(), name: 'Pessoa Sem Lugar', category: 'convidado', note: NOTE },
    ],
  };
  const seats = project.layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]);
  const first = seats[0]!;
  const last = seats[seats.length - 1]!;
  // A ordem da lista é o inverso da planta, para conferir que a projeção segue a planta.
  project = assignGuest(project, project.guests[0]!.id, last);
  project = assignGuest(project, project.guests[1]!.id, first);
  return { project, first, last };
}

describe('toSharedView', () => {
  it('com nomes: só pessoas sentadas, na ordem da planta, sem notas nem IDs', () => {
    const { project, first, last } = projectWithGuests();
    const view = toSharedView(project, 'names');
    if (view.mode !== 'names') throw new Error('modo errado');
    expect(view.seats).toEqual([
      { seatId: first, name: 'Outra Sentada', category: 'familia' },
      { seatId: last, name: 'Pessoa Sentada', category: 'padrinho' },
    ]);
    expect(view.couple).toEqual({ first: 'Alex', second: 'Ravi' });
    expect(view.weddingDate).toBe('2027-05-01');
    const json = JSON.stringify(view);
    for (const forbidden of [
      NOTE,
      TITLE,
      'Pessoa Sem Lugar',
      'linkedCounts',
      '"note"',
      ...project.guests.map((guest) => guest.id),
    ])
      expect(json).not.toContain(forbidden);
  });

  it('só a planta: nenhum nome, categoria, nota ou ID de convidado', () => {
    const { project, first, last } = projectWithGuests();
    const view = toSharedView(project, 'plan');
    if (view.mode !== 'plan') throw new Error('modo errado');
    expect(view.occupiedSeatIds).toEqual([first, last]);
    const json = JSON.stringify(view);
    for (const forbidden of [
      NOTE,
      TITLE,
      'linkedCounts',
      '"category"',
      'padrinho',
      'familia',
      ...project.guests.flatMap((guest) => [guest.id, guest.name]),
    ])
      expect(json).not.toContain(forbidden);
  });

  it('não compartilha referências com o projeto de origem', () => {
    const { project } = projectWithGuests();
    const view = toSharedView(project, 'plan');
    expect(view.layout.rows[0]).not.toBe(project.layout.rows[0]);
    expect(view.layout.rows[0]!.leftSeatIds).not.toBe(project.layout.rows[0]!.leftSeatIds);
    expect(view.couple).not.toBe(project.couple);
  });

  it('inclui a festa: nomes por mesa só com nomes e contagem só com a planta', () => {
    const { project: ceremony } = projectWithGuests();
    let project = setRoomOutline(
      { ...ceremony, reception: null },
      createRectangleOutline(1000, 800),
    );
    project = addTable(project, { name: 'Mesa dos padrinhos' });
    project = addTable(project, { name: 'Mesa vazia' });
    const tableId = project.reception!.tables[0]!.id;
    project = assignGuestToTable(project, project.guests[0]!.id, tableId);
    project = assignGuestToTable(project, project.guests[2]!.id, tableId);

    const names = toSharedView(project, 'names');
    if (names.mode !== 'names') throw new Error('modo errado');
    expect(names.reception?.tables.map((table) => table.name)).toEqual([
      'Mesa dos padrinhos',
      'Mesa vazia',
    ]);
    expect(names.reception?.guests).toEqual([
      { tableId, name: 'Pessoa Sentada', category: 'padrinho' },
      { tableId, name: 'Pessoa Sem Lugar', category: 'convidado' },
    ]);
    expect(JSON.stringify(names)).not.toContain('tableAssignments');
    expect(JSON.stringify(names)).not.toContain(NOTE);

    const plan = toSharedView(project, 'plan');
    if (plan.mode !== 'plan') throw new Error('modo errado');
    expect(plan.reception?.tableCounts).toEqual([{ tableId, occupied: 2 }]);
    const json = JSON.stringify(plan);
    for (const forbidden of [
      'tableAssignments',
      'Pessoa Sentada',
      'Pessoa Sem Lugar',
      ...project.guests.map((guest) => guest.id),
    ])
      expect(json).not.toContain(forbidden);
  });

  it('projeto sem festa devolve reception nulo', () => {
    const { project } = projectWithGuests();
    expect(toSharedView(project, 'names').reception).toBeNull();
    expect(toSharedView(project, 'plan').reception).toBeNull();
  });

  it('planta sem convidados gera projeção vazia válida', () => {
    const project = createInitialProject();
    expect(toSharedView(project, 'names')).toMatchObject({ mode: 'names', seats: [] });
    expect(toSharedView(project, 'plan')).toMatchObject({ mode: 'plan', occupiedSeatIds: [] });
  });
});
