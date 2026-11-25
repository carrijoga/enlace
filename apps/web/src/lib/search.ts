/**
 * Busca de pessoas por início de palavra, sem acentos nem caixa: "eve" encontra "Evelyn Souza",
 * mas não "Euripedes" nem "Miranildes". Cada palavra digitada precisa começar alguma palavra do
 * texto, em qualquer ordem ("sou eve" também encontra "Evelyn Souza").
 */
const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;

export function toSearchWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .split(WORD_SEPARATOR)
    .filter(Boolean);
}

/** `true` para busca vazia; senão cada palavra da busca é prefixo de alguma palavra do texto. */
export function matchesSearch(words: readonly string[], query: string): boolean {
  return toSearchWords(query).every((term) => words.some((word) => word.startsWith(term)));
}
