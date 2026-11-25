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
import { createReceptionSvg } from './reception-svg.js';

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

  it('recusa projeto sem planta da festa', () => {
    expect(() => createReceptionSvg({ ...createDemoDocument().project, reception: null })).toThrow(
      'Monte a planta da festa',
    );
  });
});
