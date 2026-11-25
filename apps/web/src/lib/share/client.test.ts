import { describe, expect, it } from 'vitest';
import { ceremonyProjectSchema, SHARE_TOKEN_LENGTH, type SharedView } from '@enlace/contracts';
import {
  coupleTitle,
  normalizeName,
  participationFromHash,
  participationReturnPath,
  shareUrl,
  tokenFromHash,
  toViewProject,
} from './client';

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
  it('monta o link com o token depois de # conforme o modo', () => {
    expect(shareUrl('https://enlace.example.test', token, 'names')).toBe(
      `https://enlace.example.test/ver#${token}`,
    );
    expect(shareUrl('https://enlace.example.test', token, 'plan')).toBe(
      `https://enlace.example.test/ver#${token}`,
    );
    expect(shareUrl('https://enlace.example.test', token, 'edit')).toBe(
      `https://enlace.example.test/participar#edit.${token}`,
    );
    expect(shareUrl('https://enlace.example.test', token, 'clone')).toBe(
      `https://enlace.example.test/participar#clone.${token}`,
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
  it('lê modo e token de participação no fragmento', () => {
    expect(participationFromHash(`#edit.${token}`)).toEqual({ mode: 'edit', token });
    expect(participationFromHash(`#clone.${token}`)).toEqual({ mode: 'clone', token });
    for (const bad of [
      '',
      '#',
      `#${token}`,
      `edit.${token}`,
      `#names.${token}`,
      `#plan.${token}`,
      `#edit.${token}.extra`,
      `#edit.${token.slice(1)}`,
      '#edit.',
    ])
      expect(participationFromHash(bad)).toBeNull();
  });
  it('reconstrói o destino de retorno para /participar preservando o fragmento', () => {
    expect(
      participationReturnPath(
        new URL(`https://enlace.example.test/conta?next=%2Fparticipar#edit.${token}`),
        '/participar',
      ),
    ).toBe(`/participar#edit.${token}`);
    expect(
      participationReturnPath(
        new URL(`https://enlace.example.test/conta?next=%2Fparticipar#clone.${token}`),
        '/participar',
      ),
    ).toBe(`/participar#clone.${token}`);
    expect(
      participationReturnPath(
        new URL(`https://enlace.example.test/conta?next=%2Fprojetos#edit.${token}`),
        '/participar',
      ),
    ).toBeNull();
    expect(
      participationReturnPath(
        new URL(`https://enlace.example.test/conta?next=%2Fparticipar#${token}`),
        '/participar',
      ),
    ).toBeNull();
  });
});

describe('adaptador da projeção', () => {
  it('modo com nomes vira um projeto válido, sem notas e com uma pessoa por cadeira', () => {
    const view: SharedView = {
      mode: 'names',
      ...base,
      guestCategories: [],
      seats: [{ seatId: seatA, name: 'Pessoa A', category: 'madrinha' }],
      reception: null,
    };
    const project = ceremonyProjectSchema.parse(toViewProject(view));
    expect(project.title).toBe('Cerimônia de Alex & Ravi');
    expect(project.guests).toEqual([
      { id: seatA, name: 'Pessoa A', category: 'madrinha', note: '' },
    ]);
    expect(project.assignments).toEqual([{ seatId: seatA, guestId: seatA }]);
  });
  it('modo só a planta não inventa nomes além de "Ocupada"', () => {
    const view: SharedView = {
      mode: 'plan',
      ...base,
      occupiedSeatIds: [seatA, seatB],
      reception: null,
    };
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
