import { describe, expect, it } from 'vitest';
import { createDemoDocument, type Project } from '@enlace/contracts';
import {
  addDoor,
  addItem,
  addTable,
  assignGuestToTable,
  createRectangleOutline,
  setRoomOutline,
} from '@enlace/domain/reception';
import { toSharedView } from '@enlace/domain';
import { createReceptionSvg, createSharedReceptionSvg } from './reception-svg.js';

const guests = [
  { id: '2c4f8a5e-6f0e-4c2b-9d1a-0b7e3c5a9f10', name: 'Ana <Fictícia>' },
  { id: '7d1e3b9a-2c5f-4a8e-b6d0-1f9c4e7a2b30', name: 'Bruno Exemplo' },
];

function projectWithReception() {
  const base = createDemoDocument().project;
  let project: Project = {
    ...base,
    title: 'Festa & <teste>',
    couple: { first: 'Ana', second: 'Bia' },
    weddingDate: '2027-06-12',
    guests: guests.map((guest) => ({ ...guest, category: 'convidado' as const, note: '' })),
    assignments: [],
    reception: null,
  };
  project = setRoomOutline(project, createRectangleOutline(1500, 1000));
  project = addDoor(project, { wall: 0, offset: 200, width: 120, opening: 'inward' });
  project = addItem(project, 'dance_floor');
  project = addTable(project, { name: 'Mesa dos amigos', x: 400, y: 400 });
  project = addTable(project, {
    name: 'Mesa vazia',
    x: 1100,
    y: 400,
    shape: 'rect',
    width: 200,
    depth: 90,
  });
  const tableId = project.reception!.tables[0]!.id;
  for (const guest of guests) project = assignGuestToTable(project, guest.id, tableId);
  return project;
}

describe('SVG da planta da festa', () => {
  it('desenha o salão e lista os convidados de cada mesa com nomes escapados', () => {
    const svg = createReceptionSvg(projectWithReception());
    expect(svg).toContain('Festa &amp; &lt;teste&gt;');
    expect(svg).toContain('Ana &lt;Fictícia&gt;');
    expect(svg).not.toContain('<Fictícia>');
    expect(svg).toContain('Bruno Exemplo');
    expect(svg).toContain('Mesa dos amigos');
    expect(svg).toContain('Sem convidados');
    expect(svg).toContain('CONVIDADOS POR MESA');
    expect(svg).toContain('12 DE JUNHO DE 2027 • PLANTA DA FESTA');
    expect(svg).toContain('2 MESAS');
    expect(svg).toContain('2 CONVIDADOS COM MESA');
    expect(svg).toMatch(/viewBox="0 0 1600 \d+"/);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('sem nomes, desenha a planta com a ocupação e não expõe nenhum convidado', () => {
    const svg = createReceptionSvg(projectWithReception(), { withNames: false });
    expect(svg).toContain('Mesa dos amigos');
    expect(svg).toContain('2/8');
    expect(svg).toContain('2 CONVIDADOS COM MESA');
    expect(svg).not.toContain('Fictícia');
    expect(svg).not.toContain('Bruno');
    expect(svg).not.toContain('CONVIDADOS POR MESA');
    expect(svg).not.toContain('Sem convidados');
    const height = (value: string) => Number(value.match(/viewBox="0 0 1600 (\d+)"/)![1]);
    expect(height(svg)).toBeLessThan(height(createReceptionSvg(projectWithReception())));
  });

  it('no link com nomes, lista os convidados; só a planta não leva nenhum nome', () => {
    const project = projectWithReception();
    const named = createSharedReceptionSvg(toSharedView(project, 'names'), 'Festa de Ana & Bia');
    expect(named).toContain('CONVIDADOS POR MESA');
    expect(named).toContain('Bruno Exemplo');
    expect(named).toContain('2/8');
    const namedPlanOnly = createSharedReceptionSvg(
      toSharedView(project, 'names'),
      'Festa de Ana & Bia',
      { withNames: false },
    );
    expect(namedPlanOnly).toContain('2/8');
    expect(namedPlanOnly).not.toContain('Bruno');
    expect(namedPlanOnly).not.toContain('CONVIDADOS POR MESA');
    const plan = createSharedReceptionSvg(toSharedView(project, 'plan'), 'Festa de Ana & Bia');
    expect(plan).toContain('Mesa dos amigos');
    expect(plan).toContain('2/8');
    expect(plan).not.toContain('Bruno');
    expect(plan).not.toContain('Fictícia');
    expect(plan).not.toContain('CONVIDADOS POR MESA');
  });

  it('recusa projeto sem planta da festa', () => {
    expect(() => createReceptionSvg({ ...createDemoDocument().project, reception: null })).toThrow(
      'Monte a planta da festa',
    );
  });
});
