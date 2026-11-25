import { describe, expect, it } from 'vitest';
import { matchesSearch, toSearchWords } from './search.js';

const words = (text: string) => toSearchWords(text);

describe('busca por início de palavra', () => {
  it('encontra pelo começo de qualquer palavra, sem acento nem caixa', () => {
    expect(matchesSearch(words('Evelyn Souza'), 'Eve')).toBe(true);
    expect(matchesSearch(words('Ana Évora'), 'evo')).toBe(true);
    expect(matchesSearch(words('João Conceição'), 'CONCEI')).toBe(true);
    expect(matchesSearch(words('Evelyn Souza'), 'sou eve')).toBe(true);
  });

  it('não encontra letras no meio das palavras', () => {
    expect(matchesSearch(words('Euripedes Fictício'), 'Eve')).toBe(false);
    expect(matchesSearch(words('Miranildes Teste'), 'e')).toBe(false);
    expect(matchesSearch(words('Miranildes Teste'), 'nil')).toBe(false);
    expect(matchesSearch(words('Evelyn Souza'), 'eve xyz')).toBe(false);
  });

  it('busca vazia ou só com espaços encontra todos', () => {
    expect(matchesSearch(words('Qualquer Pessoa'), '')).toBe(true);
    expect(matchesSearch(words('Qualquer Pessoa'), '   ')).toBe(true);
  });

  it('separa por hífen e pontuação', () => {
    expect(matchesSearch(words('Maria-Clara (madrinha)'), 'cla')).toBe(true);
    expect(matchesSearch(words('Maria-Clara (madrinha)'), 'mad')).toBe(true);
  });
});
