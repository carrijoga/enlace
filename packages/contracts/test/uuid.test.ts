import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from '../src/index';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('usa randomUUID quando disponível', () => {
    expect(createUuid()).toMatch(UUID_V4);
  });

  it('gera UUID v4 válido fora de contexto seguro', () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });
    const generated = Array.from({ length: 200 }, createUuid);
    for (const id of generated) expect(id).toMatch(UUID_V4);
    expect(new Set(generated).size).toBe(200);
  });
});
