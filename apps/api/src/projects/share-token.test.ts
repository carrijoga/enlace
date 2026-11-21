import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SHARE_TOKEN_LENGTH, shareTokenSchema } from '@enlace/contracts';
import { createViewLimiter } from './share-links.js';
import { createShareToken, verifyShareToken } from './share-token.js';

const secret = 's'.repeat(32);

describe('token do link de visualização', () => {
  it('ida e volta devolve o mesmo linkId e respeita o contrato', () => {
    const linkId = randomUUID();
    const token = createShareToken(secret, linkId);
    expect(token).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(shareTokenSchema.safeParse(token).success).toBe(true);
    expect(verifyShareToken(secret, token)).toBe(linkId);
    expect(createShareToken(secret, linkId)).toBe(token);
  });

  it('recusa outro segredo, bytes alterados e formatos inválidos', () => {
    const linkId = randomUUID();
    const token = createShareToken(secret, linkId);
    expect(verifyShareToken('t'.repeat(32), token)).toBeNull();
    // Trocar um caractere do id ou do MAC invalida a assinatura.
    for (const index of [0, 10, 30, SHARE_TOKEN_LENGTH - 2]) {
      const swapped = token[index] === 'A' ? 'B' : 'A';
      expect(
        verifyShareToken(secret, token.slice(0, index) + swapped + token.slice(index + 1)),
      ).toBeNull();
    }
    // Outro link com o MAC deste também é recusado.
    const other = createShareToken(secret, randomUUID());
    expect(verifyShareToken(secret, other.slice(0, 22) + token.slice(22))).toBeNull();
    for (const bad of [
      undefined,
      null,
      42,
      '',
      token.slice(1),
      token + 'A',
      token.replace(/./, '+'),
    ])
      expect(verifyShareToken(secret, bad)).toBeNull();
  });

  it('recusa codificação base64url não canônica', () => {
    const token = createShareToken(secret, randomUUID());
    // 48 bytes ocupam exatamente 64 caracteres, então não há bits soltos no fim; qualquer outro
    // último caractere muda os bytes e falha no HMAC.
    const last = token.at(-1)!;
    const variant = token.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    expect(verifyShareToken(secret, variant)).toBeNull();
  });

  it('não aceita linkId que não seja UUID ao emitir', () => {
    expect(() => createShareToken(secret, 'nao-e-uuid')).toThrow();
  });
});

describe('limite de leituras por link', () => {
  it('bloqueia acima do teto na janela e libera na seguinte', () => {
    const limiter = createViewLimiter(2, 60_000, 10);
    expect(limiter.hit('a', 0)).toBe(0);
    expect(limiter.hit('a', 1)).toBe(0);
    expect(limiter.hit('a', 2)).toBe(60);
    expect(limiter.hit('b', 3)).toBe(0);
    expect(limiter.hit('a', 60_000)).toBe(0);
  });

  it('não cresce sem limite de chaves', () => {
    const limiter = createViewLimiter(5, 60_000, 2);
    expect(limiter.hit('a', 0)).toBe(0);
    expect(limiter.hit('b', 0)).toBe(0);
    expect(limiter.hit('c', 0)).toBeGreaterThan(0);
    expect(limiter.hit('a', 0)).toBe(0);
    expect(limiter.hit('c', 60_000)).toBe(0);
  });
});
