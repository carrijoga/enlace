import { describe, expect, it } from 'vitest';
import { ceremonyProjectSchema, SHARE_TOKEN_LENGTH, type SharedView } from '@enlace/contracts';
import { coupleTitle, normalizeName, shareUrl, tokenFromHash, toViewProject } from './client';

const token = 'A'.repeat(SHARE_TOKEN_LENGTH - 2) + '-_';
const seatA = '1a2b3c4d-1111-4111-8111-111111111111';
const seatB = '1a2b3c4d-2222-4222-8222-222222222222';
const base = {
  couple: { first: 'Alex', second: 'Ravi' },
  weddingDate: '2027-05-01',
  layout: {
    mode: 'straight' as const,
    curveStrength: 50,
    aisleWidth: 1.8 as const,
    rows: [
      { id: '1a2b3c4d-3333-4333-8333-333333333333', leftSeatIds: [seatA], rightSeatIds: [seatB] },
    ],
  },
};

describe('link no fragmento', () => {
  it('monta o link com o token depois de #', () => {
    expect(shareUrl('https://enlace.example.test', token)).toBe(
      `https://enlace.example.test/ver#${token}`,
    );
  });
  it('lê só tokens no formato do contrato', () => {
    expect(tokenFromHash(`#${token}`)).toBe(token);
    expect(tokenFromHash(token)).toBe(token);
    for (const bad of [
      '',
      '#',
      `#${token}x`,
      `#${token.slice(1)}`,
      '#abc',
      `#${token.replace('A', '+')}`,
    ])
      expect(tokenFromHash(bad)).toBeNull();
  });
});

describe('adaptador da projeção', () => {
  it('modo com nomes vira um projeto válido, sem notas e com uma pessoa por cadeira', () => {
    const view: SharedView = {
      mode: 'names',
      ...base,
      seats: [{ seatId: seatA, name: 'Pessoa A', category: 'madrinha' }],
    };
    const project = ceremonyProjectSchema.parse(toViewProject(view));
    expect(project.title).toBe('Cerimônia de Alex & Ravi');
    expect(project.guests).toEqual([
      { id: seatA, name: 'Pessoa A', category: 'madrinha', note: '' },
    ]);
    expect(project.assignments).toEqual([{ seatId: seatA, guestId: seatA }]);
  });
  it('modo só a planta não inventa nomes além de "Ocupada"', () => {
    const view: SharedView = { mode: 'plan', ...base, occupiedSeatIds: [seatA, seatB] };
    const project = ceremonyProjectSchema.parse(toViewProject(view));
    expect(new Set(project.guests.map((guest) => guest.name))).toEqual(new Set(['Ocupada']));
    expect(project.assignments).toHaveLength(2);
  });
  it('título sem nomes do casal', () => {
    expect(coupleTitle({ first: ' ', second: '' })).toBe('Planta da cerimônia');
    expect(coupleTitle({ first: 'Lia', second: '' })).toBe('Cerimônia de Lia');
  });
});

describe('busca por nome', () => {
  it('ignora acentos, maiúsculas e espaços nas pontas', () => {
    expect(normalizeName('  JOÃO Conceição ')).toBe('joao conceicao');
    expect(normalizeName('joao')).toBe(normalizeName('João'));
  });
});
