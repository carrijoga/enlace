/**
 * Importação de convidados por CSV (fase 4, ADR-0008).
 *
 * Contrato definido pelo coordenador; a implementação deve manter estas assinaturas.
 * Módulo carregado sob demanda pelo editor: não importar a partir da entrada da rota.
 * Todo arquivo é dado não confiável: nunca interpretar conteúdo como instrução ou fórmula.
 */
import type { CeremonyProject } from '@enlace/contracts';

export type GuestCategory = CeremonyProject['guests'][number]['category'];
export type CsvDelimiter = ',' | ';' | '\t';

/** Tamanho máximo do arquivo antes da decodificação. */
export const MAX_CSV_BYTES = 1024 * 1024;
/** Linhas físicas não vazias aceitas (inclui cabeçalho). O limite de 300 convidados vale na confirmação. */
export const MAX_CSV_ROWS = 1000;
export const MAX_CSV_COLUMNS = 30;

export class CsvError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'CsvError';
  }
}

export interface DecodedCsv {
  text: string;
  /** `windows-1252` quando os bytes não são UTF-8 válido (Excel pt-BR); a prévia avisa para conferir acentos. */
  encoding: 'utf-8' | 'windows-1252';
}

export interface CsvRow {
  /** Linha física (1-based) onde o registro começa no arquivo. */
  line: number;
  cells: string[];
}

export interface ColumnMapping {
  name: number | null;
  category: number | null;
  note: number | null;
}

export interface PreviewOptions {
  rows: CsvRow[];
  hasHeader: boolean;
  mapping: ColumnMapping;
  /** Usada quando a célula de categoria está vazia ou não há coluna de categoria. */
  defaultCategory: GuestCategory;
  /** Mapeamento escolhido pela pessoa para valores desconhecidos, por `normalizeForMatch(valor)`. */
  categoryMap: Record<string, GuestCategory>;
  /** Nomes já existentes no projeto, para aviso de possível duplicidade. */
  existingNames: string[];
}

export interface PreviewLine {
  line: number;
  name: string;
  /** `null` somente quando há erro de categoria desconhecida sem mapeamento. */
  category: GuestCategory | null;
  note: string;
  /** Valor original (aparado) da célula de categoria, '' se ausente. */
  rawCategory: string;
  errors: string[];
  /** Possível duplicidade por nome normalizado: com convidado do projeto ou linha anterior do arquivo. Apenas aviso. */
  duplicateOf: 'project' | 'file' | null;
}

export interface CsvPreview {
  lines: PreviewLine[];
  /** Valores de categoria desconhecidos distintos, na ordem da primeira ocorrência: chave normalizada e texto original. */
  unknownCategories: { key: string; label: string }[];
}

const HEADER_ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ['nome', 'nome completo', 'convidado', 'convidada', 'convidados', 'pessoa', 'name'],
  category: ['categoria', 'grupo', 'tipo', 'papel', 'category', 'group'],
  note: ['observacao', 'observacoes', 'obs', 'nota', 'notas', 'note', 'notes'],
};

const CATEGORY_ALIASES: Record<string, GuestCategory> = {
  familia: 'familia',
  family: 'familia',
  padrinho: 'padrinho',
  padrinhos: 'padrinho',
  madrinha: 'madrinha',
  madrinhas: 'madrinha',
  pajem: 'pajem',
  pajens: 'pajem',
  convidado: 'convidado',
  convidada: 'convidado',
  convidados: 'convidado',
  convidadas: 'convidado',
  guest: 'convidado',
};

/** trim, remove acentos (NFD), minúsculas e espaços internos colapsados. */
export function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** '' (após trim) → null; alias conhecido → categoria; senão undefined. */
export function matchCategory(value: string): GuestCategory | null | undefined {
  const key = normalizeForMatch(value);
  if (!key) return null;
  return Object.hasOwn(CATEGORY_ALIASES, key) ? CATEGORY_ALIASES[key] : undefined;
}

/**
 * Cabeçalho exige ao menos um alias que não seja também valor de categoria: "convidada" numa
 * linha de dados (categoria) não pode transformar a primeira pessoa em cabeçalho.
 */
export function looksLikeHeader(cells: string[]): boolean {
  const unambiguous = Object.values(HEADER_ALIASES)
    .flat()
    .filter((alias) => !Object.hasOwn(CATEGORY_ALIASES, alias));
  return cells.some((cell) => unambiguous.includes(normalizeForMatch(cell)));
}

/** Com cabeçalho, procura aliases; sem cabeçalho (ou sem alias de nome), nome = coluna 0 e demais null. */
export function guessMapping(header: string[] | null, columnCount: number): ColumnMapping {
  const mapping: ColumnMapping = { name: null, category: null, note: null };
  if (header) {
    const normalized = header.map(normalizeForMatch);
    for (const field of Object.keys(HEADER_ALIASES) as (keyof ColumnMapping)[]) {
      const index = normalized.findIndex(
        (cell, i) => HEADER_ALIASES[field].includes(cell) && !Object.values(mapping).includes(i),
      );
      if (index >= 0) mapping[field] = index;
    }
  }
  if (mapping.name === null && columnCount > 0) mapping.name = 0;
  return mapping;
}

// ---- Implementação: decodeCsvBytes, detectDelimiter, parseCsv, buildPreview, toGuests ----

const MAX_NAME_LENGTH = 100;
const MAX_NOTE_LENGTH = 1000;

/**
 * Remove BOM UTF-8; decodifica UTF-8 estrito e, se inválido, windows-1252.
 * Lança CsvError se `bytes.byteLength > MAX_CSV_BYTES` ou arquivo vazio.
 */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  if (bytes.byteLength > MAX_CSV_BYTES) throw new CsvError('O arquivo deve ter até 1 MiB.');
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  let text: string;
  let encoding: DecodedCsv['encoding'] = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    text = new TextDecoder('windows-1252').decode(body);
    encoding = 'windows-1252';
  }
  if (text.trim() === '') throw new CsvError('O arquivo está vazio.');
  return { text, encoding };
}

/** Conta `,` `;` e tab fora de aspas na primeira linha não vazia; maior contagem vence; empate ou zero → ','. */
export function detectDelimiter(text: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [',', ';', '\t'];
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  let fieldStart = true;
  let hasContent = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (hasContent) break;
      fieldStart = true;
      continue;
    }
    if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      hasContent = true;
      continue;
    }
    if (char === ',' || char === ';' || char === '\t') {
      counts[char]++;
      fieldStart = true;
      hasContent = true;
      continue;
    }
    fieldStart = false;
    if (char.trim() !== '') hasContent = true;
  }
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  let tie = false;
  for (const candidate of candidates) {
    const count = counts[candidate];
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
      tie = false;
    } else if (count > 0 && count === bestCount) {
      tie = true;
    }
  }
  return tie || bestCount === 0 ? ',' : best;
}

/**
 * RFC 4180: campos entre aspas com delimitador, quebras de linha e `""`; CRLF, LF ou CR.
 * Remove registros cujas células são todas vazias/brancas. Não apara células (buildPreview apara).
 * Lança CsvError (com linha) para aspas não fechadas, mais de MAX_CSV_ROWS registros ou MAX_CSV_COLUMNS colunas.
 */
export function parseCsv(text: string, delimiter: CsvDelimiter): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const pushField = () => {
    if (cells.length >= MAX_CSV_COLUMNS) {
      throw new CsvError(
        `O arquivo tem mais de ${MAX_CSV_COLUMNS} colunas (linha ${recordLine}).`,
        recordLine,
      );
    }
    cells.push(field);
    field = '';
    fieldStart = true;
  };
  const endRecord = () => {
    pushField();
    if (cells.some((cell) => cell.trim() !== '')) {
      if (rows.length >= MAX_CSV_ROWS) {
        throw new CsvError(
          `O arquivo tem mais de ${MAX_CSV_ROWS} linhas (a partir da linha ${recordLine}).`,
          recordLine,
        );
      }
      rows.push({ line: recordLine, cells });
    }
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === '\r') {
        if (text[i + 1] === '\n') {
          field += '\r\n';
          i++;
        } else {
          field += '\r';
        }
        line++;
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }
    if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      quoteLine = line;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
      fieldStart = false;
    }
  }
  if (inQuotes) {
    throw new CsvError(`Aspas sem fechamento a partir da linha ${quoteLine}.`, quoteLine);
  }
  endRecord();
  return rows;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Uma PreviewLine por registro (exceto cabeçalho). Nome/observação aparados, espaços internos do nome colapsados.
 * Erros (pt-BR): 'Escolha a coluna do nome.' se mapping.name null; 'Nome vazio.'; 'Nome com mais de 100 caracteres.';
 * 'Observação com mais de 1000 caracteres.'; `Categoria desconhecida: "<valor>".` quando não há alias nem categoryMap.
 * Coluna mapeada ausente na linha conta como célula vazia.
 */
export function buildPreview(options: PreviewOptions): CsvPreview {
  const { rows, hasHeader, mapping, defaultCategory, categoryMap, existingNames } = options;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const existing = new Set(existingNames.map(normalizeForMatch).filter((key) => key !== ''));
  const seenInFile = new Set<string>();
  const unknown = new Map<string, string>();
  const lines: PreviewLine[] = [];
  const cell = (row: CsvRow, index: number | null) =>
    index === null ? '' : (row.cells[index] ?? '');

  for (const row of dataRows) {
    const errors: string[] = [];
    const name = cleanText(cell(row, mapping.name));
    // Observação: apenas aparada; quebras de linha internas são preservadas.
    const note = cell(row, mapping.note).trim();
    const rawCategory = cell(row, mapping.category).trim();

    if (mapping.name === null) errors.push('Escolha a coluna do nome.');
    else if (name === '') errors.push('Nome vazio.');
    else if (name.length > MAX_NAME_LENGTH) errors.push('Nome com mais de 100 caracteres.');
    if (note.length > MAX_NOTE_LENGTH) errors.push('Observação com mais de 1000 caracteres.');

    let category: GuestCategory | null;
    if (rawCategory === '') {
      category = defaultCategory;
    } else {
      const matched = matchCategory(rawCategory);
      if (matched) {
        category = matched;
      } else {
        const key = normalizeForMatch(rawCategory);
        if (!unknown.has(key)) unknown.set(key, rawCategory);
        if (Object.hasOwn(categoryMap, key)) {
          category = categoryMap[key];
        } else {
          category = null;
          errors.push(`Categoria desconhecida: "${rawCategory}".`);
        }
      }
    }

    let duplicateOf: PreviewLine['duplicateOf'] = null;
    const nameKey = normalizeForMatch(name);
    if (nameKey !== '') {
      if (existing.has(nameKey)) duplicateOf = 'project';
      else if (seenInFile.has(nameKey)) duplicateOf = 'file';
      seenInFile.add(nameKey);
    }

    lines.push({ line: row.line, name, category, note, rawCategory, errors, duplicateOf });
  }

  return {
    lines,
    unknownCategories: [...unknown].map(([key, label]) => ({ key, label })),
  };
}

/** Convidados das linhas incluídas (por número de linha) e sem erros, na ordem do arquivo, com IDs de `newId`. */
export function toGuests(
  lines: PreviewLine[],
  included: ReadonlySet<number>,
  newId: () => string,
): CeremonyProject['guests'] {
  const guests: CeremonyProject['guests'] = [];
  for (const line of lines) {
    if (!included.has(line.line) || line.errors.length > 0 || line.category === null) continue;
    guests.push({ id: newId(), name: line.name, category: line.category, note: line.note });
  }
  return guests;
}
