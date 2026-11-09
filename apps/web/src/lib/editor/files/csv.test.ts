import { describe, expect, it } from 'vitest';
import {
  buildPreview,
  CsvError,
  decodeCsvBytes,
  detectDelimiter,
  guessMapping,
  looksLikeHeader,
  matchCategory,
  MAX_CSV_BYTES,
  MAX_CSV_COLUMNS,
  MAX_CSV_ROWS,
  parseCsv,
  toGuests,
  type ColumnMapping,
  type CsvRow,
  type PreviewOptions,
} from './csv';

const encode = (text: string) => new TextEncoder().encode(text);

function expectCsvError(fn: () => unknown, message: RegExp | string, line?: number) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CsvError);
    const csvError = error as CsvError;
    if (typeof message === 'string') expect(csvError.message).toBe(message);
    else expect(csvError.message).toMatch(message);
    if (line !== undefined) expect(csvError.line).toBe(line);
    return;
  }
  throw new Error('Era esperado um CsvError.');
}

function rowsOf(...records: string[][]): CsvRow[] {
  return records.map((cells, index) => ({ line: index + 1, cells }));
}

function options(overrides: Partial<PreviewOptions> = {}): PreviewOptions {
  return {
    rows: [],
    hasHeader: false,
    mapping: { name: 0, category: 1, note: 2 },
    defaultCategory: 'convidado',
    categoryMap: {},
    existingNames: [],
    ...overrides,
  };
}

describe('decodeCsvBytes', () => {
  it('decodifica UTF-8 e remove o BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('Nome\nAna Lima')]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: 'Nome\nAna Lima', encoding: 'utf-8' });
  });

  it('usa windows-1252 quando os bytes não são UTF-8 válido', () => {
    const bytes = new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: 'José', encoding: 'windows-1252' });
  });

  it('rejeita arquivo vazio, só BOM ou só espaços', () => {
    expectCsvError(() => decodeCsvBytes(new Uint8Array()), 'O arquivo está vazio.');
    expectCsvError(
      () => decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf])),
      'O arquivo está vazio.',
    );
    expectCsvError(() => decodeCsvBytes(encode(' \r\n\t \n')), 'O arquivo está vazio.');
  });

  it('rejeita arquivo acima de 1 MiB e aceita exatamente 1 MiB', () => {
    expectCsvError(
      () => decodeCsvBytes(new Uint8Array(MAX_CSV_BYTES + 1)),
      'O arquivo deve ter até 1 MiB.',
    );
    const exact = new Uint8Array(MAX_CSV_BYTES).fill(0x61);
    expect(decodeCsvBytes(exact).text.length).toBe(MAX_CSV_BYTES);
  });
});

describe('detectDelimiter', () => {
  it('detecta vírgula, ponto e vírgula e tabulação', () => {
    expect(detectDelimiter('Nome,Categoria\nAna,familia')).toBe(',');
    expect(detectDelimiter('Nome;Categoria;Obs\nAna;familia;x')).toBe(';');
    expect(detectDelimiter('Nome\tCategoria\nAna\tfamilia')).toBe('\t');
  });

  it('ignora delimitadores dentro de aspas e linhas em branco iniciais', () => {
    expect(detectDelimiter('\n\n"Silva, Ana";familia')).toBe(';');
  });

  it('usa vírgula em empate ou sem delimitadores', () => {
    expect(detectDelimiter('a,b;c')).toBe(',');
    expect(detectDelimiter('a;b,c')).toBe(',');
    expect(detectDelimiter('Somente nomes\nOutro')).toBe(',');
  });

  it('considera apenas a primeira linha não vazia', () => {
    expect(detectDelimiter('Nome;Cat\na,b,c,d,e')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('lê com vírgula, ponto e vírgula e tabulação', () => {
    expect(parseCsv('a,b\nc,d', ',')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ]);
    expect(parseCsv('a;b\nc;d', ';').map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a\tb\nc\td', '\t').map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('trata campos entre aspas com delimitador, quebra de linha e aspas escapadas', () => {
    const rows = parseCsv('"Silva, Ana","linha 1\nlinha 2","disse ""oi"""\nBeto,x,y', ',');
    expect(rows).toEqual([
      { line: 1, cells: ['Silva, Ana', 'linha 1\nlinha 2', 'disse "oi"'] },
      { line: 3, cells: ['Beto', 'x', 'y'] },
    ]);
  });

  it('aceita CRLF, LF e CR', () => {
    expect(parseCsv('a,b\r\nc,d\r\ne,f', ',').map((r) => [r.line, ...r.cells])).toEqual([
      [1, 'a', 'b'],
      [2, 'c', 'd'],
      [3, 'e', 'f'],
    ]);
    expect(parseCsv('a\rb\rc', ',').map((r) => [r.line, ...r.cells])).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
  });

  it('remove linhas em branco e mantém o número da linha física após campo multilinha', () => {
    const rows = parseCsv('Nome\n\n"a\nb\r\nc"\n   ,  \n\nFim\n', ',');
    expect(rows).toEqual([
      { line: 1, cells: ['Nome'] },
      { line: 3, cells: ['a\nb\r\nc'] },
      { line: 8, cells: ['Fim'] },
    ]);
  });

  it('não apara células', () => {
    expect(parseCsv('  Ana  , x ', ',')[0].cells).toEqual(['  Ana  ', ' x ']);
  });

  it('trata aspas no meio de campo sem aspas como literais', () => {
    expect(parseCsv('5" tela,ok', ',')[0].cells).toEqual(['5" tela', 'ok']);
  });

  it('é leniente com texto após aspas de fechamento', () => {
    expect(parseCsv('"Ana"xyz,b', ',')[0].cells).toEqual(['Anaxyz', 'b']);
  });

  it('mantém texto parecido com fórmula como texto simples', () => {
    const rows = parseCsv('=SOMA(A1),+1,@x', ',');
    expect(rows[0].cells).toEqual(['=SOMA(A1)', '+1', '@x']);
  });

  it('aceita última linha sem quebra final', () => {
    expect(parseCsv('a,b\nc,d', ',')).toHaveLength(2);
  });

  it('informa a linha de aspas não fechadas', () => {
    expectCsvError(
      () => parseCsv('Nome\nAna\n"Beto,x\nCarla', ','),
      'Aspas sem fechamento a partir da linha 3.',
      3,
    );
  });

  it('aplica limite de linhas', () => {
    const ok = Array.from({ length: MAX_CSV_ROWS }, (_, i) => `n${i}`).join('\n');
    expect(parseCsv(ok, ',')).toHaveLength(MAX_CSV_ROWS);
    expectCsvError(() => parseCsv(`${ok}\nextra`, ','), /1000 linhas/, MAX_CSV_ROWS + 1);
  });

  it('linhas em branco não contam para o limite de linhas', () => {
    const text = Array.from({ length: MAX_CSV_ROWS }, (_, i) => `n${i}\n\n`).join('');
    expect(parseCsv(text, ',')).toHaveLength(MAX_CSV_ROWS);
  });

  it('aplica limite de colunas', () => {
    const ok = Array.from({ length: MAX_CSV_COLUMNS }, () => 'x').join(',');
    expect(parseCsv(ok, ',')[0].cells).toHaveLength(MAX_CSV_COLUMNS);
    expectCsvError(() => parseCsv(`a\n${ok},y`, ','), /30 colunas/, 2);
  });
});

describe('cabeçalho e mapeamento', () => {
  it('detecta cabeçalho com acentos e mapeia colunas', () => {
    const header = ['Nome completo', 'Categoria', 'Observação'];
    expect(looksLikeHeader(header)).toBe(true);
    expect(guessMapping(header, 3)).toEqual({ name: 0, category: 1, note: 2 });
  });

  it('não confunde nomes de pessoas com cabeçalho', () => {
    expect(looksLikeHeader(['Ana Lima', 'familia'])).toBe(false);
    // Valor de categoria igual a alias de coluna não basta para virar cabeçalho.
    expect(looksLikeHeader(['Elisa Fictícia', 'convidada'])).toBe(false);
    expect(looksLikeHeader(['Convidado', 'Categoria'])).toBe(true);
    expect(guessMapping(['Convidado', 'Categoria'], 2)).toEqual({
      name: 0,
      category: 1,
      note: null,
    });
    expect(guessMapping(null, 3)).toEqual({ name: 0, category: null, note: null });
  });

  it('matchCategory não trata propriedades de Object como categorias', () => {
    expect(matchCategory('constructor')).toBeUndefined();
    expect(matchCategory('__proto__')).toBeUndefined();
    expect(matchCategory('Família')).toBe('familia');
  });
});

describe('buildPreview', () => {
  const header = ['Nome', 'Categoria', 'Observação'];

  it('ignora a primeira linha com cabeçalho e resolve categorias por alias', () => {
    const preview = buildPreview(
      options({
        hasHeader: true,
        rows: rowsOf(header, ['  Ana   Lima ', 'Família', ' mesa 1 '], ['Beto', 'PADRINHOS', '']),
      }),
    );
    expect(preview.lines).toEqual([
      {
        line: 2,
        name: 'Ana Lima',
        category: 'familia',
        note: 'mesa 1',
        rawCategory: 'Família',
        errors: [],
        duplicateOf: null,
      },
      {
        line: 3,
        name: 'Beto',
        category: 'padrinho',
        note: '',
        rawCategory: 'PADRINHOS',
        errors: [],
        duplicateOf: null,
      },
    ]);
    expect(preview.unknownCategories).toEqual([]);
  });

  it('sem cabeçalho considera a primeira linha como dado', () => {
    const preview = buildPreview(options({ rows: rowsOf(['Ana', 'pajem', '']) }));
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0].category).toBe('pajem');
  });

  it('usa categoria padrão para célula vazia, ausente ou sem coluna de categoria', () => {
    const preview = buildPreview(
      options({
        defaultCategory: 'familia',
        rows: rowsOf(['Ana', ' ', ''], ['Beto'], ['Carla', 'madrinha']),
      }),
    );
    expect(preview.lines.map((l) => l.category)).toEqual(['familia', 'familia', 'madrinha']);

    const noColumn = buildPreview(
      options({
        mapping: { name: 0, category: null, note: null },
        defaultCategory: 'pajem',
        rows: rowsOf(['Ana', 'padrinho']),
      }),
    );
    expect(noColumn.lines[0].category).toBe('pajem');
    expect(noColumn.lines[0].rawCategory).toBe('');
  });

  it('reporta categoria desconhecida sem mapeamento como erro', () => {
    const preview = buildPreview(
      options({
        rows: rowsOf(['Ana', ' Vizinhos '], ['Beto', 'vizinhos'], ['Carla', 'Colegas']),
      }),
    );
    expect(preview.lines[0].category).toBeNull();
    expect(preview.lines[0].errors).toEqual(['Categoria desconhecida: "Vizinhos".']);
    expect(preview.unknownCategories).toEqual([
      { key: 'vizinhos', label: 'Vizinhos' },
      { key: 'colegas', label: 'Colegas' },
    ]);
  });

  it('resolve categoria desconhecida via categoryMap e continua listando o valor', () => {
    const preview = buildPreview(
      options({
        rows: rowsOf(['Ana', 'Vizinhos'], ['Beto', 'Colegas']),
        categoryMap: { vizinhos: 'familia' },
      }),
    );
    expect(preview.lines[0].category).toBe('familia');
    expect(preview.lines[0].errors).toEqual([]);
    expect(preview.lines[1].category).toBeNull();
    expect(preview.unknownCategories.map((u) => u.key)).toEqual(['vizinhos', 'colegas']);
  });

  it('não confunde valores como "constructor" com categorias conhecidas', () => {
    const preview = buildPreview(options({ rows: rowsOf(['Ana', 'constructor']) }));
    expect(preview.lines[0].category).toBeNull();
    expect(preview.unknownCategories).toEqual([{ key: 'constructor', label: 'constructor' }]);
  });

  it('detecta duplicidade com o projeto e dentro do arquivo', () => {
    const preview = buildPreview(
      options({
        existingNames: ['  JOSÉ  da Silva'],
        rows: rowsOf(['Jose da Silva'], ['Maria Souza'], ['maria  souza'], ['Maria Souza']),
      }),
    );
    expect(preview.lines.map((l) => l.duplicateOf)).toEqual(['project', null, 'file', 'file']);
  });

  it('nomes vazios não geram duplicidade', () => {
    const preview = buildPreview(
      options({ existingNames: [''], rows: rowsOf([''], ['  '], ['Ana']) }),
    );
    expect(preview.lines.map((l) => l.duplicateOf)).toEqual([null, null, null]);
    expect(preview.lines[0].errors).toEqual(['Nome vazio.']);
  });

  it('valida tamanho de nome e observação', () => {
    const preview = buildPreview(
      options({
        rows: rowsOf(
          ['a'.repeat(100)],
          ['a'.repeat(101)],
          ['Ana', '', 'n'.repeat(1000)],
          ['Beto', '', 'n'.repeat(1001)],
        ),
      }),
    );
    expect(preview.lines[0].errors).toEqual([]);
    expect(preview.lines[1].errors).toEqual(['Nome com mais de 100 caracteres.']);
    expect(preview.lines[2].errors).toEqual([]);
    expect(preview.lines[3].errors).toEqual(['Observação com mais de 1000 caracteres.']);
  });

  it('exige coluna de nome', () => {
    const mapping: ColumnMapping = { name: null, category: null, note: null };
    const preview = buildPreview(options({ mapping, rows: rowsOf(['Ana']) }));
    expect(preview.lines[0].errors).toEqual(['Escolha a coluna do nome.']);
  });

  it('trata coluna mapeada ausente como célula vazia', () => {
    const preview = buildPreview(
      options({ mapping: { name: 0, category: 5, note: 6 }, rows: rowsOf(['Ana']) }),
    );
    expect(preview.lines[0]).toMatchObject({ name: 'Ana', category: 'convidado', note: '' });
  });

  it('mantém texto de fórmula como texto simples', () => {
    const preview = buildPreview(options({ rows: rowsOf(['=SOMA(A1)', 'familia', '@cmd|calc']) }));
    expect(preview.lines[0]).toMatchObject({
      name: '=SOMA(A1)',
      note: '@cmd|calc',
      errors: [],
    });
  });
});

describe('toGuests', () => {
  it('filtra linhas excluídas ou com erro e preserva a ordem', () => {
    const preview = buildPreview(
      options({
        rows: [
          { line: 2, cells: ['Ana', 'familia', 'n1'] },
          { line: 3, cells: ['', 'familia', ''] },
          { line: 5, cells: ['Beto', 'Vizinhos', ''] },
          { line: 6, cells: ['Carla', 'madrinha', ''] },
          { line: 9, cells: ['Davi', '', 'n4'] },
        ],
      }),
    );
    let n = 0;
    const guests = toGuests(preview.lines, new Set([2, 3, 5, 9]), () => `id-${++n}`);
    expect(guests).toEqual([
      { id: 'id-1', name: 'Ana', category: 'familia', note: 'n1' },
      { id: 'id-2', name: 'Davi', category: 'convidado', note: 'n4' },
    ]);
  });

  it('retorna lista vazia sem linhas incluídas', () => {
    const preview = buildPreview(options({ rows: rowsOf(['Ana']) }));
    expect(toGuests(preview.lines, new Set(), () => 'x')).toEqual([]);
  });
});

describe('fluxo completo', () => {
  it('lê CSV de Excel pt-BR em windows-1252 com ponto e vírgula', () => {
    const bytes = new Uint8Array([
      ...encode('Nome;Categoria;Observa'),
      0xe7,
      0xe3,
      ...encode('o\r\nJos'),
      0xe9,
      ...encode(';Fam'),
      0xed,
      ...encode('lia;"alergico a amendoim"\r\n'),
    ]);
    const { text, encoding } = decodeCsvBytes(bytes);
    expect(encoding).toBe('windows-1252');
    const delimiter = detectDelimiter(text);
    expect(delimiter).toBe(';');
    const rows = parseCsv(text, delimiter);
    expect(looksLikeHeader(rows[0].cells)).toBe(true);
    const preview = buildPreview(
      options({ rows, hasHeader: true, mapping: guessMapping(rows[0].cells, 3) }),
    );
    expect(preview.lines[0]).toMatchObject({ name: 'José', category: 'familia' });
  });
});
