<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createUuid, type CeremonyProject } from '@enlace/contracts';
  import { GUEST_CATEGORY_OPTIONS } from './guest-categories';
  import {
    CsvError,
    MAX_CSV_BYTES,
    buildPreview,
    decodeCsvBytes,
    detectDelimiter,
    guessMapping,
    looksLikeHeader,
    matchCategory,
    parseCsv,
    toGuests,
    type ColumnMapping,
    type CsvDelimiter,
    type CsvRow,
    type GuestCategory,
  } from './files/csv';

  type Guests = CeremonyProject['guests'];

  let {
    existingNames,
    capacity,
    onImport,
    onClose,
  }: {
    existingNames: string[];
    /** Quantos convidados ainda cabem no projeto. */
    capacity: number;
    /** Retorna false quando o editor recusou o lote; o diálogo continua aberto. */
    onImport: (guests: Guests) => boolean;
    onClose: () => void;
  } = $props();

  const DELIMITERS: { value: CsvDelimiter; label: string }[] = [
    { value: ',', label: 'Vírgula (,)' },
    { value: ';', label: 'Ponto e vírgula (;)' },
    { value: '\t', label: 'Tabulação' },
  ];

  const FIELDS: { field: keyof ColumnMapping; label: string }[] = [
    { field: 'name', label: 'Nome' },
    { field: 'category', label: 'Categoria' },
    { field: 'note', label: 'Observação' },
  ];

  let dialog: HTMLDialogElement;
  let fileInput: HTMLInputElement;
  let fileName = $state('');
  let text = $state<string | null>(null);
  let encoding = $state<'utf-8' | 'windows-1252'>('utf-8');
  let delimiter = $state<CsvDelimiter>(',');
  let rows = $state<CsvRow[]>([]);
  let hasHeader = $state(false);
  let mapping = $state<ColumnMapping>({ name: null, category: null, note: null });
  let defaultCategory = $state<GuestCategory>('convidado');
  let categoryMap = $state<Record<string, GuestCategory>>({});
  let excluded = $state(new Set<number>());
  let error = $state('');
  let reading = $state(false);

  const columnCount = $derived(rows.reduce((max, row) => Math.max(max, row.cells.length), 0));
  const columns = $derived(
    Array.from({ length: columnCount }, (_, index) => {
      const head = hasHeader ? rows[0]?.cells[index]?.trim() : '';
      return { index, label: head ? `${head} (coluna ${index + 1})` : `Coluna ${index + 1}` };
    }),
  );
  const preview = $derived(
    text === null
      ? null
      : buildPreview({ rows, hasHeader, mapping, defaultCategory, categoryMap, existingNames }),
  );
  const lines = $derived(preview?.lines ?? []);
  const included = $derived(new Set(lines.filter((l) => !excluded.has(l.line)).map((l) => l.line)));
  const includedWithErrors = $derived(
    lines.filter((l) => included.has(l.line) && l.errors.length).length,
  );
  const duplicates = $derived(lines.filter((l) => l.duplicateOf).length);
  const errorCount = $derived(lines.filter((l) => l.errors.length).length);
  const blocker = $derived(
    !preview
      ? ''
      : mapping.name === null
        ? 'Escolha a coluna do nome.'
        : includedWithErrors
          ? `${includedWithErrors} ${includedWithErrors === 1 ? 'linha selecionada tem' : 'linhas selecionadas têm'} erro. Corrija o arquivo ou o mapeamento, ou desmarque essas linhas.`
          : included.size === 0
            ? 'Nenhuma linha selecionada.'
            : included.size > capacity
              ? `O projeto aceita até 300 convidados; cabem mais ${capacity}. Desmarque ${included.size - capacity} ${included.size - capacity === 1 ? 'linha' : 'linhas'}.`
              : '',
  );

  onMount(() => {
    dialog.showModal();
    void tick().then(() => fileInput?.focus());
  });

  function reparse() {
    if (text === null) return;
    error = '';
    try {
      rows = parseCsv(text, delimiter);
    } catch (problem) {
      rows = [];
      error = problem instanceof CsvError ? problem.message : 'Não foi possível ler o arquivo.';
    }
    hasHeader = rows.length > 0 && looksLikeHeader(rows[0]!.cells);
    remap();
  }
  function remap() {
    const guessed = guessMapping(hasHeader ? (rows[0]?.cells ?? null) : null, columnCount);
    if (!hasHeader && guessed.category === null) {
      // Sem cabeçalho: uma coluna cujos valores preenchidos são todos categorias conhecidas vira categoria.
      for (let index = 0; index < columnCount; index++) {
        if (index === guessed.name) continue;
        const values = rows.map((row) => row.cells[index] ?? '').filter((v) => v.trim());
        if (values.length && values.every((value) => matchCategory(value))) {
          guessed.category = index;
          break;
        }
      }
    }
    mapping = guessed;
    categoryMap = {};
    excluded = new Set();
  }

  async function chooseFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    fileName = file.name;
    text = null;
    rows = [];
    error = '';
    reading = true;
    try {
      if (file.size > MAX_CSV_BYTES) throw new CsvError('O arquivo deve ter até 1 MiB.');
      const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      encoding = decoded.encoding;
      delimiter = detectDelimiter(decoded.text);
      text = decoded.text;
      reparse();
    } catch (problem) {
      error = problem instanceof CsvError ? problem.message : 'Não foi possível ler o arquivo.';
    } finally {
      reading = false;
    }
    await tick();
  }

  function setColumn(field: keyof ColumnMapping, value: string) {
    mapping = { ...mapping, [field]: value === '' ? null : Number(value) };
    excluded = new Set();
  }
  function toggle(line: number, on: boolean) {
    excluded = on
      ? new Set([...excluded].filter((value) => value !== line))
      : new Set([...excluded, line]);
  }
  function exclude(predicate: (line: (typeof lines)[number]) => boolean) {
    excluded = new Set([...excluded, ...lines.filter(predicate).map((l) => l.line)]);
  }
  function confirm() {
    if (blocker || !preview) return;
    if (onImport(toGuests(lines, included, createUuid))) dialog.close();
  }
  const categoryLabel = (value: GuestCategory | null) =>
    GUEST_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? '—';
</script>

<dialog
  bind:this={dialog}
  class="csv-dialog"
  aria-labelledby="csv-title"
  onclose={onClose}
  oncancel={onClose}
  aria-describedby="csv-intro"
  aria-busy={reading}
>
  <h2 id="csv-title">Importar convidados de CSV</h2>
  <p class="lead" id="csv-intro">
    Uma pessoa por linha. Nome é obrigatório; categoria e observação são opcionais. Nada é
    adicionado antes de você confirmar a prévia.
  </p>

  <label class="file-pick">
    <span>{fileName ? 'Trocar arquivo' : 'Escolher arquivo CSV'}</span>
    <input
      type="file"
      accept=".csv,.txt,text/csv,text/plain"
      onchange={chooseFile}
      disabled={reading}
      bind:this={fileInput}
    />
  </label>
  {#if fileName}<p class="file-name">{fileName}</p>{/if}
  {#if reading}<p class="message" role="status">Lendo arquivo…</p>{/if}
  {#if error}<p class="message error" role="alert">{error}</p>{/if}

  {#if preview && rows.length}
    {#if encoding === 'windows-1252'}
      <p class="message warn">
        O arquivo não está em UTF-8. Ele foi lido como texto do Windows; confira os acentos na
        prévia.
      </p>
    {/if}
    <div class="options">
      <label
        >Separador
        <select
          bind:value={delimiter}
          onchange={reparse}
          aria-describedby={error ? undefined : 'csv-summary'}
        >
          {#each DELIMITERS as option (option.value)}<option value={option.value}
              >{option.label}</option
            >{/each}
        </select></label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={hasHeader} onchange={remap} /> Primeira linha é cabeçalho</label
      >
      {#each FIELDS as item (item.field)}
        <label
          >{item.label}
          <select
            value={mapping[item.field] === null ? '' : String(mapping[item.field])}
            onchange={(event) => setColumn(item.field, event.currentTarget.value)}
          >
            <option value="">{item.field === 'name' ? 'Escolha…' : 'Não importar'}</option>
            {#each columns as column (column.index)}<option value={String(column.index)}
                >{column.label}</option
              >{/each}
          </select></label
        >
      {/each}
      <label
        >Categoria quando vazia
        <select bind:value={defaultCategory}>
          {#each GUEST_CATEGORY_OPTIONS as option (option.value)}<option value={option.value}
              >{option.label}</option
            >{/each}
        </select></label
      >
    </div>

    {#if preview.unknownCategories.length}
      <fieldset class="unknown">
        <legend>Categorias não reconhecidas</legend>
        {#each preview.unknownCategories as unknown (unknown.key)}
          <label
            >“{unknown.label}” vira
            <select
              value={categoryMap[unknown.key] ?? ''}
              onchange={(event) => {
                const value = event.currentTarget.value as GuestCategory | '';
                const next = { ...categoryMap };
                if (value) next[unknown.key] = value;
                else delete next[unknown.key];
                categoryMap = next;
              }}
            >
              <option value="">Escolha…</option>
              {#each GUEST_CATEGORY_OPTIONS as option (option.value)}<option value={option.value}
                  >{option.label}</option
                >{/each}
            </select></label
          >
        {/each}
      </fieldset>
    {/if}

    <p class="summary" id="csv-summary" aria-live="polite" aria-atomic="true">
      {lines.length}
      {lines.length === 1 ? 'linha' : 'linhas'} · {included.size} selecionadas · {errorCount} com erro
      · {duplicates} possíveis duplicadas
    </p>
    <div class="bulk">
      {#if errorCount}<button type="button" onclick={() => exclude((l) => l.errors.length > 0)}
          >Desmarcar linhas com erro</button
        >{/if}
      {#if duplicates}<button type="button" onclick={() => exclude((l) => l.duplicateOf !== null)}
          >Desmarcar possíveis duplicadas</button
        >{/if}
      {#if excluded.size}<button type="button" onclick={() => (excluded = new Set())}
          >Marcar todas</button
        >{/if}
    </div>

    <div class="table-wrap">
      <table>
        <caption class="sr-only">Prévia das linhas que podem ser importadas</caption>
        <thead>
          <tr
            ><th scope="col"><span class="sr-only">Importar</span></th><th scope="col">Linha</th><th
              scope="col">Nome</th
            ><th scope="col">Categoria</th><th scope="col">Observação</th><th scope="col"
              >Situação</th
            ></tr
          >
        </thead>
        <tbody>
          {#each lines as line (line.line)}
            <tr class:has-error={line.errors.length > 0} class:off={!included.has(line.line)}>
              <td
                ><input
                  type="checkbox"
                  aria-label={`Importar linha ${line.line}`}
                  checked={included.has(line.line)}
                  onchange={(event) => toggle(line.line, event.currentTarget.checked)}
                /></td
              >
              <td>{line.line}</td>
              <td>{line.name || '—'}</td>
              <td>{categoryLabel(line.category)}</td>
              <td class="note">{line.note}</td>
              <td
                >{#if line.errors.length}<span class="bad">{line.errors.join(' ')}</span
                  >{:else if line.duplicateOf}<span class="dup"
                    >{line.duplicateOf === 'project'
                      ? 'Nome já existe no projeto'
                      : 'Nome repetido no arquivo'}</span
                  >{:else}<span class="ok">Pronta</span>{/if}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if blocker}<p class="message error">{blocker}</p>{/if}
  <div class="actions">
    <button type="button" onclick={() => dialog.close()}>Cancelar</button>
    <button
      type="button"
      class="primary"
      disabled={reading || !preview || Boolean(blocker)}
      onclick={confirm}
      >{preview && included.size
        ? `Adicionar ${included.size} ${included.size === 1 ? 'convidado' : 'convidados'}`
        : 'Adicionar convidados'}</button
    >
  </div>
</dialog>

<style>
  .csv-dialog {
    border: 1px solid #d4ddcd;
    padding: 26px;
    border-radius: 14px;
    width: min(860px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: #fffefb;
    color: #27342c;
    font-size: 13px;
  }
  .csv-dialog::backdrop {
    background: rgb(25 45 31 / 0.4);
  }
  h2 {
    font:
      400 25px Georgia,
      serif;
    margin: 0 0 8px;
  }
  .lead,
  .file-name,
  .summary {
    color: #536354;
    line-height: 1.6;
    margin: 0 0 12px;
  }
  .file-pick {
    display: inline-flex;
    position: relative;
    padding: 9px 13px;
    border: 1px solid #c4d0c0;
    border-radius: 8px;
    color: #295842;
    font-weight: 600;
    cursor: pointer;
  }
  .file-pick span {
    min-height: 24px;
    align-content: center;
  }
  .file-pick:focus-within {
    outline: 2px solid #295842;
    outline-offset: 2px;
  }
  .file-pick input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .file-name {
    margin-top: 8px;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 10px 14px;
    margin: 14px 0;
  }
  .options label,
  .unknown label {
    display: grid;
    gap: 4px;
    font-weight: 600;
    color: #3d4c41;
  }
  .options label.check {
    display: flex;
    align-items: center;
    gap: 7px;
    align-self: end;
    font-weight: 500;
  }
  select {
    font: inherit;
    padding: 7px 8px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    background: white;
    color: inherit;
  }
  .unknown {
    border: 1px solid #e3d6b8;
    background: #fbf7ec;
    border-radius: 10px;
    padding: 10px 14px 14px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
    margin: 0 0 12px;
  }
  .unknown legend {
    font-weight: 700;
    padding: 0 4px;
  }
  .bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  .bulk button,
  .actions button {
    font: inherit;
    font-weight: 600;
    padding: 8px 12px;
    border: 1px solid #c4d0c0;
    background: transparent;
    color: #295842;
    border-radius: 8px;
    cursor: pointer;
  }
  .actions button.primary {
    background: #295842;
    border-color: #295842;
    color: white;
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .table-wrap {
    max-height: 42dvh;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid #dfe3da;
    border-radius: 10px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 7px 9px;
    border-bottom: 1px solid #eceee8;
    vertical-align: top;
  }
  th {
    position: sticky;
    top: 0;
    background: #f6f7f2;
    font-weight: 700;
  }
  td.note {
    max-width: 220px;
    overflow-wrap: anywhere;
    color: #536354;
  }
  tr.off td {
    opacity: 0.5;
  }
  tr.has-error {
    background: #fdf1ee;
  }
  .bad {
    color: #9b2f1f;
  }
  .dup {
    color: #7a5a14;
  }
  .ok {
    color: #295842;
  }
  .message {
    padding: 9px 12px;
    border-radius: 8px;
    margin: 10px 0;
    line-height: 1.5;
  }
  .message.error {
    background: #fdf1ee;
    color: #8a2a1b;
  }
  .message.warn {
    background: #fbf7ec;
    color: #6b4f12;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 16px;
  }
  .csv-dialog :focus-visible {
    outline: 3px solid #5f825f;
    outline-offset: 2px;
  }
  @media (max-width: 600px) {
    .csv-dialog {
      box-sizing: border-box;
      width: calc(100vw - 16px);
      max-width: none;
      max-height: calc(100dvh - 16px);
      padding: 16px;
      margin: auto;
    }
    .actions {
      position: sticky;
      bottom: -16px;
      padding: 10px 0 2px;
      background: #fffefb;
    }
    .actions button,
    .bulk button,
    .options select,
    .unknown select {
      min-height: 42px;
    }
    .table-wrap {
      max-height: 38dvh;
      -webkit-overflow-scrolling: touch;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
