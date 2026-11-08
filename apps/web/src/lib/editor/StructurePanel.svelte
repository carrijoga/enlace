<script lang="ts">
  import type { CeremonyProject } from '@enlace/contracts';

  type LayoutPatch = Partial<
    Pick<CeremonyProject['layout'], 'mode' | 'curveStrength' | 'aisleWidth' | 'linkedCounts'>
  >;
  type DetailsPatch = Partial<Pick<CeremonyProject, 'title' | 'couple' | 'weddingDate'>>;
  let {
    project,
    onLayoutChange,
    onRowCount,
    onAddRow,
    onRemoveRow,
    onDetailsChange,
  }: {
    project: CeremonyProject;
    onLayoutChange: (patch: LayoutPatch) => void;
    onRowCount: (rowId: string, side: 'left' | 'right', count: number) => void;
    onAddRow: () => void;
    onRemoveRow: (rowId: string) => void;
    onDetailsChange: (patch: DetailsPatch) => void;
  } = $props();

  let title = $state('');
  let first = $state('');
  let second = $state('');
  let weddingDate = $state('');
  let detailsError = $state('');
  const aisleOptions = [1.2, 1.5, 1.8, 2.1, 2.4, 3] as const;

  $effect(() => {
    title = project.title;
    first = project.couple.first;
    second = project.couple.second;
    weddingDate = project.weddingDate ?? '';
  });

  function changeCount(rowId: string, side: 'left' | 'right', current: number, delta: number) {
    onRowCount(rowId, side, Math.max(0, Math.min(12, current + delta)));
  }

  function setCount(rowId: string, side: 'left' | 'right', event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.value === '') return;
    const count = Number(input.value);
    if (!Number.isFinite(count)) return;
    onRowCount(rowId, side, Math.max(0, Math.min(12, Math.trunc(count))));
    const row = project.layout.rows.find((candidate) => candidate.id === rowId);
    if (row)
      input.value = String(side === 'left' ? row.leftSeatIds.length : row.rightSeatIds.length);
  }

  function saveDetails(event: SubmitEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      detailsError = 'Informe o nome do projeto.';
      return;
    }
    detailsError = '';
    onDetailsChange({
      title: cleanTitle,
      couple: { first: first.trim(), second: second.trim() },
      weddingDate: weddingDate || null,
    });
  }
</script>

<aside class="structure-panel" aria-labelledby="structure-title">
  <header class="panel-header">
    <h2 id="structure-title">Estrutura da cerimônia</h2>
  </header>

  <section class="section" aria-labelledby="format-title">
    <h3 id="format-title">Formato</h3>
    <div class="mode-options" role="group" aria-label="Formato da planta">
      <button
        type="button"
        aria-pressed={project.layout.mode === 'straight'}
        class:active={project.layout.mode === 'straight'}
        onclick={() => onLayoutChange({ mode: 'straight' })}>Tradicional</button
      >
      <button
        type="button"
        aria-pressed={project.layout.mode === 'curve'}
        class:active={project.layout.mode === 'curve'}
        onclick={() => onLayoutChange({ mode: 'curve' })}>Meia-lua</button
      >
    </div>
    {#if project.layout.mode === 'curve'}
      <div class="range-heading">
        <label for="curve-strength">Curvatura</label><output for="curve-strength"
          >{project.layout.curveStrength}%</output
        >
      </div>
      <input
        id="curve-strength"
        class="range"
        type="range"
        min="0"
        max="100"
        step="5"
        value={project.layout.curveStrength}
        oninput={(event) =>
          onLayoutChange({
            curveStrength: Number((event.currentTarget as HTMLInputElement).value),
          })}
      />
    {/if}
  </section>

  <section class="section" aria-labelledby="aisle-title">
    <h3 id="aisle-title">Corredor</h3>
    <label class="field-label" for="aisle-width">Largura visual</label>
    <select
      id="aisle-width"
      value={project.layout.aisleWidth}
      onchange={(event) =>
        onLayoutChange({
          aisleWidth: Number(
            (event.currentTarget as HTMLSelectElement).value,
          ) as (typeof aisleOptions)[number],
        })}
    >
      {#each aisleOptions as width (width)}<option value={width}
          >{width.toLocaleString('pt-BR')} m</option
        >{/each}
    </select>
    <label class="check-row"
      ><input
        type="checkbox"
        checked={project.layout.linkedCounts}
        onchange={(event) =>
          onLayoutChange({ linkedCounts: (event.currentTarget as HTMLInputElement).checked })}
      /><span>Vincular os lados</span></label
    >
  </section>

  <section class="section rows-section" aria-labelledby="rows-title">
    <div class="section-heading">
      <h3 id="rows-title">Fileiras</h3>
      <span>{project.layout.rows.length} / 12</span>
    </div>
    {#each project.layout.rows as row, index (row.id)}
      <div class="row-card">
        <div class="row-card-heading">
          <h4>Fileira {index + 1}</h4>
          <button
            class="remove-row"
            type="button"
            aria-label={`Remover fileira ${index + 1}`}
            title={`Remover fileira ${index + 1}`}
            disabled={project.layout.rows.length <= 1}
            onclick={() => onRemoveRow(row.id)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20"
              ><path d="M4 6h12M8 6V4h4v2m-6 0 1 10h6l1-10M8.5 9v4m3-4v4" /></svg
            >
          </button>
        </div>
        <div class="side-count">
          <label for={`row-left-${row.id}`}>Esquerda</label>
          <div class="stepper">
            <button
              type="button"
              aria-label={`Diminuir cadeiras à esquerda na fileira ${index + 1}`}
              disabled={row.leftSeatIds.length <= 0}
              onclick={() => changeCount(row.id, 'left', row.leftSeatIds.length, -1)}
              ><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h10" /></svg></button
            >
            <input
              id={`row-left-${row.id}`}
              type="number"
              min="0"
              max="12"
              step="1"
              value={row.leftSeatIds.length}
              aria-label={`Cadeiras à esquerda na fileira ${index + 1}`}
              onchange={(event) => setCount(row.id, 'left', event)}
            />
            <button
              type="button"
              aria-label={`Aumentar cadeiras à esquerda na fileira ${index + 1}`}
              disabled={row.leftSeatIds.length >= 12 ||
                (project.layout.linkedCounts && row.rightSeatIds.length >= 12)}
              onclick={() => changeCount(row.id, 'left', row.leftSeatIds.length, 1)}
              ><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg></button
            >
          </div>
        </div>
        <div class="side-count">
          <label for={`row-right-${row.id}`}>Direita</label>
          <div class="stepper">
            <button
              type="button"
              aria-label={`Diminuir cadeiras à direita na fileira ${index + 1}`}
              disabled={row.rightSeatIds.length <= 0}
              onclick={() => changeCount(row.id, 'right', row.rightSeatIds.length, -1)}
              ><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h10" /></svg></button
            >
            <input
              id={`row-right-${row.id}`}
              type="number"
              min="0"
              max="12"
              step="1"
              value={row.rightSeatIds.length}
              aria-label={`Cadeiras à direita na fileira ${index + 1}`}
              onchange={(event) => setCount(row.id, 'right', event)}
            />
            <button
              type="button"
              aria-label={`Aumentar cadeiras à direita na fileira ${index + 1}`}
              disabled={row.rightSeatIds.length >= 12 ||
                (project.layout.linkedCounts && row.leftSeatIds.length >= 12)}
              onclick={() => changeCount(row.id, 'right', row.rightSeatIds.length, 1)}
              ><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg></button
            >
          </div>
        </div>
      </div>
    {/each}
    <button
      class="add-row"
      type="button"
      disabled={project.layout.rows.length >= 12}
      onclick={onAddRow}
      ><svg aria-hidden="true" viewBox="0 0 18 18"><path d="M9 3v12M3 9h12" /></svg><span
        >Adicionar fileira</span
      ></button
    >
  </section>

  <details class="details-section">
    <summary>Casal e data</summary>
    <form onsubmit={saveDetails}>
      <label for="project-title">Nome do projeto</label><input
        id="project-title"
        bind:value={title}
        maxlength="120"
        required
      />
      <label for="couple-first">Nome</label><input
        id="couple-first"
        bind:value={first}
        maxlength="80"
      />
      <label for="couple-second">Nome</label><input
        id="couple-second"
        bind:value={second}
        maxlength="80"
      />
      <label for="wedding-date">Data da cerimônia</label><input
        id="wedding-date"
        type="date"
        bind:value={weddingDate}
      />
      {#if detailsError}<p class="error" role="alert">{detailsError}</p>{/if}
      <button class="save-details" type="submit">Atualizar detalhes</button>
    </form>
  </details>

  <p class="footnote">A planta é esquemática. Confira medidas reais com a cerimonialista.</p>
</aside>

<style>
  .structure-panel {
    --structure-forest: var(--editor-forest, #295842);
    --structure-paper: var(--editor-surface, #fffefb);
    --structure-ink: var(--editor-ink, #27342c);
    --structure-muted: var(--editor-muted, #626e63);
    --structure-line: var(--editor-line, #dfe3da);
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    padding: 0;
    background: transparent;
    color: var(--structure-ink);
    font:
      14px/1.45 'Segoe UI',
      system-ui,
      sans-serif;
  }
  .panel-header {
    padding-bottom: 13px;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.3;
  }
  .section {
    padding: 12px 0;
    border-top: 1px solid var(--structure-line);
  }
  .section h3 {
    margin: 0 0 9px;
    font-size: 13px;
  }
  .mode-options {
    display: flex;
    gap: 5px;
  }
  .mode-options button {
    flex: 1;
    min-height: 38px;
    padding: 6px;
    border: 1px solid var(--structure-line);
    border-radius: 7px;
    background: transparent;
    color: var(--structure-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .mode-options button.active {
    border-color: #96ae97;
    background: #edf3eb;
    color: var(--structure-forest);
    font-weight: 700;
  }
  .range-heading {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    font-size: 12px;
  }
  .range-heading output {
    color: var(--structure-muted);
  }
  .range {
    width: 100%;
    margin: 9px 0 0;
    accent-color: var(--structure-forest);
  }
  .field-label,
  .details-section label {
    display: block;
    margin: 7px 0 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .structure-panel select,
  .details-section input:not([type='checkbox']) {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid var(--structure-line);
    border-radius: 7px;
    background: #fff;
    color: var(--structure-ink);
    font: inherit;
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .check-row input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--structure-forest);
  }
  .section-heading,
  .row-card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-heading span {
    color: var(--structure-muted);
    font-size: 11px;
  }
  .rows-section {
    padding-bottom: 8px;
  }
  .row-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 8px 0;
    padding: 9px;
    border: 1px solid var(--structure-line);
    border-radius: 8px;
  }
  .row-card-heading {
    grid-column: 1/-1;
  }
  .row-card-heading h4 {
    margin: 0;
    font-size: 12px;
  }
  .remove-row {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--structure-muted);
    cursor: pointer;
  }
  .remove-row svg,
  .stepper svg,
  .add-row svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
  .remove-row:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .side-count label {
    display: block;
    margin: 0 0 4px;
    color: var(--structure-muted);
    font-size: 11px;
  }
  .stepper {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    align-items: center;
  }
  .stepper button {
    display: grid;
    width: 32px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--structure-line);
    background: var(--structure-paper);
    color: var(--structure-forest);
    cursor: pointer;
  }
  .stepper button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .stepper button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .stepper button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .stepper input {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding: 2px;
    border: solid var(--structure-line);
    border-width: 1px 0;
    border-radius: 0;
    text-align: center;
    color: var(--structure-ink);
    font: inherit;
    font-size: 13px;
    appearance: textfield;
  }
  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  .add-row {
    display: flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed #9eae9e;
    border-radius: 7px;
    background: transparent;
    color: var(--structure-forest);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .add-row:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .details-section {
    padding: 12px 0;
    border-top: 1px solid var(--structure-line);
  }
  .details-section summary {
    min-height: 32px;
    align-content: center;
    color: var(--structure-forest);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .details-section form {
    padding-top: 5px;
  }
  .details-section input:not([type='checkbox']) {
    min-height: 38px;
  }
  .save-details {
    width: 100%;
    min-height: 38px;
    margin-top: 10px;
    border: 0;
    border-radius: 7px;
    background: var(--structure-forest);
    color: white;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .error {
    margin: 6px 0;
    color: #922f28;
    font-size: 12px;
  }
  .footnote {
    margin: 8px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--structure-line);
    color: var(--structure-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .structure-panel :focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .structure-panel {
      width: 100%;
      padding: 0;
    }
    .structure-panel select,
    .details-section input:not([type='checkbox']),
    .mode-options button,
    .save-details {
      min-height: 42px;
    }
  }
</style>
