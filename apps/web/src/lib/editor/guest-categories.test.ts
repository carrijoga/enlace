import { describe, expect, it } from 'vitest';
import { BUILTIN_GUEST_CATEGORY_LABELS, GUEST_CATEGORY_COLORS } from '@enlace/contracts';
import {
  CUSTOM_CATEGORY_COLORS,
  GUEST_CATEGORIES,
  categoryLookup,
  legendEntries,
} from './guest-categories.js';

describe('estilos das categorias', () => {
  it('usa os mesmos rótulos e cores que os contratos', () => {
    for (const [key, label] of Object.entries(BUILTIN_GUEST_CATEGORY_LABELS))
      expect(GUEST_CATEGORIES[key as keyof typeof GUEST_CATEGORIES].label).toBe(label);
    expect(Object.keys(CUSTOM_CATEGORY_COLORS).sort()).toEqual([...GUEST_CATEGORY_COLORS].sort());
  });

  it('resolve personalizadas pelo id e cai em Convidado quando desconhecida', () => {
    const id = '5b2f0c1d-3e4a-4b6c-9d8e-7f6a5b4c3d2e';
    const lookup = categoryLookup([{ id, label: 'Trabalho', color: 'azul' }]);
    expect(lookup(id)).toMatchObject({ label: 'Trabalho', fill: CUSTOM_CATEGORY_COLORS.azul.fill });
    expect(lookup('3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c').label).toBe('Convidado');
    expect(legendEntries([{ id, label: 'Trabalho', color: 'azul' }]).map((e) => e.label)).toEqual([
      'Família',
      'Padrinhos',
      'Pajem',
      'Convidado',
      'Trabalho',
    ]);
  });
});
