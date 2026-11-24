import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createShareLinkRequestSchema,
  shareLinkSchema,
  sharedViewRequestSchema,
  sharedViewSchema,
  SHARE_TOKEN_LENGTH,
} from '../src/index.js';

const token = 'A'.repeat(SHARE_TOKEN_LENGTH - 2) + '-_';
const seatA = randomUUID();
const seatB = randomUUID();
const layout = {
  mode: 'straight' as const,
  curveStrength: 50,
  aisleWidth: 1.8 as const,
  rows: [{ id: randomUUID(), leftSeatIds: [seatA], rightSeatIds: [seatB] }],
};
const base = { couple: { first: 'Alex', second: 'Ravi' }, weddingDate: null, layout };

describe('criação de link', () => {
  it('aceita nome, modo e validades permitidas', () => {
    for (const expiresInDays of [7, 30, 90, null])
      for (const mode of ['names', 'plan', 'edit', 'clone'])
        expect(
          createShareLinkRequestSchema.safeParse({ label: 'Família', mode, expiresInDays }).success,
        ).toBe(true);
  });
  it('recusa nome vazio ou longo, modo, validade e campos desconhecidos', () => {
    const valid = { label: 'Família', mode: 'names', expiresInDays: 30 };
    for (const input of [
      { ...valid, label: '' },
      { ...valid, label: '   ' },
      { ...valid, label: 'x'.repeat(61) },
      { ...valid, mode: 'admin' },
      { ...valid, expiresInDays: 1 },
      { ...valid, expiresInDays: undefined },
      { ...valid, projectId: randomUUID() },
      { ...valid, ownerId: 'outra-conta' },
    ])
      expect(createShareLinkRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('token', () => {
  it('aceita só base64url com o tamanho exato', () => {
    expect(sharedViewRequestSchema.safeParse({ token }).success).toBe(true);
    for (const bad of [
      token.slice(1),
      token + 'A',
      token.slice(1) + '=',
      token.slice(1) + '+',
      token.slice(1) + '/',
      '',
    ])
      expect(sharedViewRequestSchema.safeParse({ token: bad }).success).toBe(false);
    expect(sharedViewRequestSchema.safeParse({ token, mode: 'names' }).success).toBe(false);
  });
  it('descreve o link do dono sem dados do projeto', () => {
    const link = {
      id: randomUUID(),
      label: 'Cerimonialista',
      mode: 'plan',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      token,
    };
    expect(shareLinkSchema.safeParse(link).success).toBe(true);
    expect(shareLinkSchema.safeParse({ ...link, projectId: randomUUID() }).success).toBe(false);
  });
});

describe('projeção pública', () => {
  it('aceita os dois modos com cadeiras existentes', () => {
    expect(
      sharedViewSchema.safeParse({
        mode: 'names',
        ...base,
        seats: [{ seatId: seatA, name: 'Pessoa A', category: 'familia' }],
      }).success,
    ).toBe(true);
    expect(
      sharedViewSchema.safeParse({ mode: 'plan', ...base, occupiedSeatIds: [seatA, seatB] })
        .success,
    ).toBe(true);
  });
  it('recusa dados de convidado no modo só a planta e campos privados no modo com nomes', () => {
    expect(
      sharedViewSchema.safeParse({
        mode: 'plan',
        ...base,
        occupiedSeatIds: [],
        seats: [{ seatId: seatA, name: 'Pessoa A', category: 'familia' }],
      }).success,
    ).toBe(false);
    for (const extra of [{ note: 'privada' }, { guestId: randomUUID() }])
      expect(
        sharedViewSchema.safeParse({
          mode: 'names',
          ...base,
          seats: [{ seatId: seatA, name: 'Pessoa A', category: 'familia', ...extra }],
        }).success,
      ).toBe(false);
    for (const extra of [{ title: 'Projeto' }, { revision: 3 }, { guests: [] }])
      expect(
        sharedViewSchema.safeParse({ mode: 'plan', ...base, occupiedSeatIds: [], ...extra })
          .success,
      ).toBe(false);
    expect(
      sharedViewSchema.safeParse({
        mode: 'plan',
        ...base,
        layout: { ...layout, linkedCounts: true },
        occupiedSeatIds: [],
      }).success,
    ).toBe(false);
  });
  it('recusa cadeira inexistente ou repetida', () => {
    expect(
      sharedViewSchema.safeParse({ mode: 'plan', ...base, occupiedSeatIds: [randomUUID()] })
        .success,
    ).toBe(false);
    expect(
      sharedViewSchema.safeParse({ mode: 'plan', ...base, occupiedSeatIds: [seatA, seatA] })
        .success,
    ).toBe(false);
    expect(
      sharedViewSchema.safeParse({
        mode: 'names',
        ...base,
        seats: [
          { seatId: seatA, name: 'Pessoa A', category: 'familia' },
          { seatId: seatA, name: 'Pessoa B', category: 'convidado' },
        ],
      }).success,
    ).toBe(false);
  });
});
