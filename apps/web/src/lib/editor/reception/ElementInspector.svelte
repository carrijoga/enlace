<script lang="ts">
  import {
    RECEPTION_ITEM_KINDS,
    RECEPTION_LIMITS,
    type ReceptionItemKind,
  } from '@enlace/contracts';
  import {
    RECEPTION_ITEM_DEFAULTS,
    formatMeters,
    normalizeRotation,
    parseMeters,
  } from '@enlace/domain/reception';
  import type { ElementInspectorProps } from './contracts';

  let {
    reception,
    selected,
    occupancy,
    onAddTable,
    onAddItem,
    onUpdateTable,
    onSetSeats,
    onUpdateItem,
    onUpdateColumn,
    onDuplicate,
    onRemove,
    onClose,
  }: ElementInspectorProps = $props();

  const MAX_POSITION = RECEPTION_LIMITS.maxCoordinate;
  const MAX_NAME = RECEPTION_LIMITS.maxNameLength;
  const addableKinds = RECEPTION_ITEM_KINDS.filter(
    (kind): kind is Exclude<ReceptionItemKind, 'custom'> => kind !== 'custom',
  );

  const table = $derived(
    selected?.kind === 'table'
      ? reception.tables.find((entry) => entry.id === selected.id)
      : undefined,
  );
  const item = $derived(
    selected?.kind === 'item'
      ? reception.items.find((entry) => entry.id === selected.id)
      : undefined,
  );
  const column = $derived(
    selected?.kind === 'column'
      ? reception.room.columns.find((entry) => entry.id === selected.id)
      : undefined,
  );
  const element = $derived(table ?? item ?? column);

  let fields = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let customName = $state('');
  let customError = $state('');

  // Ressincroniza os campos quando o elemento muda, é movido ou o projeto é desfeito.
  $effect(() => {
    if (!element) return;
    fields = {
      name: table?.name ?? item?.name ?? '',
      width: formatMeters(element.width),
      depth: formatMeters(element.depth),
      x: formatMeters(element.x),
      y: formatMeters(element.y),
      rotation: String(table?.rotation ?? item?.rotation ?? 0),
      seats: String(table?.seats ?? ''),
    };
    errors = {};
  });

  const tablesFull = $derived(reception.tables.length >= RECEPTION_LIMITS.maxTables);
  const itemsFull = $derived(reception.items.length >= RECEPTION_LIMITS.maxItems);
  const kindLabel = $derived(
    table
      ? 'Mesa'
      : item
        ? item.kind === 'custom'
          ? 'Item personalizado'
          : RECEPTION_ITEM_DEFAULTS[item.kind].name
        : 'Coluna',
  );
  const guests = $derived(table ? (occupancy.get(table.id) ?? 0) : 0);

  function fail(key: string, message: string) {
    errors[key] = message;
    return false;
  }

  /** Lê metros do campo; devolve centímetros ou registra o erro e devolve `null`. */
  function readMeters(key: string, label: string, min: number, max: number): number | null {
    const value = parseMeters(fields[key] ?? '');
    if (value === null) {
      fail(key, `${label}: informe um número em metros, como 1,5.`);
      return null;
    }
    if (value < min || value > max) {
      fail(key, `${label}: use entre ${formatMeters(min)} e ${formatMeters(max)} m.`);
      return null;
    }
    delete errors[key];
    return value;
  }

  type Patchable = { width?: number; depth?: number; x?: number; y?: number; rotation?: number };

  function apply(patch: Patchable) {
    if (!selected) return;
    if (table) onUpdateTable(table.id, patch);
    else if (item) onUpdateItem(item.id, patch);
    else if (column) onUpdateColumn(column.id, patch);
  }

  function commitMeters(
    key: 'width' | 'depth' | 'x' | 'y',
    label: string,
    min: number,
    max: number,
  ) {
    const value = readMeters(key, label, min, max);
    if (value === null) return;
    const current = element?.[key];
    if (value !== current) apply({ [key]: value });
    fields[key] = formatMeters(value);
  }

  function commitName() {
    const name = (fields.name ?? '').trim();
    if (!name) {
      fail('name', 'Informe um nome.');
      return;
    }
    if (name.length > MAX_NAME) {
      fail('name', `O nome aceita até ${MAX_NAME} caracteres.`);
      return;
    }
    delete errors.name;
    fields.name = name;
    if (table && name !== table.name) onUpdateTable(table.id, { name });
    else if (item && name !== item.name) onUpdateItem(item.id, { name });
  }

  function setRotation(degrees: number) {
    const value = normalizeRotation(degrees);
    fields.rotation = String(value);
    delete errors.rotation;
    const current = table?.rotation ?? item?.rotation;
    if (value !== current) apply({ rotation: value });
  }

  function commitRotation() {
    const text = (fields.rotation ?? '').trim().replace(',', '.');
    const value = Number(text);
    if (!text || !Number.isFinite(value)) {
      fail('rotation', 'Rotação: informe os graus, como 45.');
      return;
    }
    setRotation(value);
  }

  function changeSeats(seats: number) {
    if (!table) return;
    const { minTableSeats, maxTableSeats } = RECEPTION_LIMITS;
    if (!Number.isInteger(seats) || seats < minTableSeats || seats > maxTableSeats) {
      fail('seats', `Cadeiras: use um número inteiro de ${minTableSeats} a ${maxTableSeats}.`);
      return;
    }
    delete errors.seats;
    fields.seats = String(seats);
    if (seats !== table.seats) onSetSeats(table.id, seats);
  }

  function setShape(shape: 'round' | 'rect') {
    if (table && table.shape !== shape) onUpdateTable(table.id, { shape });
  }

  function submitCustom(event: SubmitEvent) {
    event.preventDefault();
    const name = customName.trim();
    if (!name) customError = 'Informe um nome para o item.';
    else if (name.length > MAX_NAME) customError = `O nome aceita até ${MAX_NAME} caracteres.`;
    else {
      customError = '';
      customName = '';
      onAddItem('custom', name);
    }
  }

  function enter(event: KeyboardEvent) {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
  }
</script>

{#snippet meters(key: 'width' | 'depth' | 'x' | 'y', label: string, min: number, max: number)}
  <div class="field">
    <label for={`insp-${key}`}>{label}</label>
    <input
      id={`insp-${key}`}
      inputmode="decimal"
      autocomplete="off"
      aria-invalid={errors[key] ? 'true' : undefined}
      aria-describedby={errors[key] ? `insp-${key}-error` : undefined}
      bind:value={fields[key]}
      onchange={() => commitMeters(key, label.replace(/ \(m\)$/, ''), min, max)}
      onkeydown={enter}
    />
    {#if errors[key]}<p class="error" id={`insp-${key}-error`} role="alert">{errors[key]}</p>{/if}
  </div>
{/snippet}

{#snippet rotationField()}
  <div class="field">
    <label for="insp-rotation">Rotação (graus)</label>
    <div class="stepper">
      <button
        type="button"
        aria-label="Girar 15 graus para a esquerda"
        onclick={() => setRotation((table?.rotation ?? item?.rotation ?? 0) - 15)}>−15°</button
      >
      <input
        id="insp-rotation"
        inputmode="numeric"
        autocomplete="off"
        aria-invalid={errors.rotation ? 'true' : undefined}
        aria-describedby={errors.rotation ? 'insp-rotation-error' : undefined}
        bind:value={fields.rotation}
        onchange={commitRotation}
        onkeydown={enter}
      />
      <button
        type="button"
        aria-label="Girar 15 graus para a direita"
        onclick={() => setRotation((table?.rotation ?? item?.rotation ?? 0) + 15)}>+15°</button
      >
    </div>
    {#if errors.rotation}<p class="error" id="insp-rotation-error" role="alert">
        {errors.rotation}
      </p>{/if}
  </div>
{/snippet}

{#snippet nameField()}
  <div class="field">
    <label for="insp-name">Nome</label>
    <input
      id="insp-name"
      maxlength={MAX_NAME}
      autocomplete="off"
      aria-invalid={errors.name ? 'true' : undefined}
      aria-describedby={errors.name ? 'insp-name-error' : undefined}
      bind:value={fields.name}
      onchange={commitName}
      onkeydown={enter}
    />
    {#if errors.name}<p class="error" id="insp-name-error" role="alert">{errors.name}</p>{/if}
  </div>
{/snippet}

{#snippet position()}
  <div class="pair">
    {@render meters('x', 'Posição X (m)', 0, MAX_POSITION)}
    {@render meters('y', 'Posição Y (m)', 0, MAX_POSITION)}
  </div>
  <p class="hint">A posição é o centro do elemento.</p>
{/snippet}

<div class="inspector">
  {#if !element || !selected}
    <header class="panel-header"><h2>Adicionar</h2></header>

    <section class="section" aria-labelledby="add-tables-title">
      <div class="section-heading">
        <h3 id="add-tables-title">Mesas</h3>
        <span>{reception.tables.length} / {RECEPTION_LIMITS.maxTables}</span>
      </div>
      <div class="button-pair">
        <button
          type="button"
          class="ghost"
          disabled={tablesFull}
          onclick={() => onAddTable('round')}>Mesa redonda</button
        >
        <button type="button" class="ghost" disabled={tablesFull} onclick={() => onAddTable('rect')}
          >Mesa retangular</button
        >
      </div>
      {#if tablesFull}<p class="hint">
          Limite de {RECEPTION_LIMITS.maxTables} mesas atingido.
        </p>{/if}
    </section>

    <section class="section" aria-labelledby="add-items-title">
      <div class="section-heading">
        <h3 id="add-items-title">Elementos</h3>
        <span>{reception.items.length} / {RECEPTION_LIMITS.maxItems}</span>
      </div>
      <div class="button-grid">
        {#each addableKinds as kind (kind)}
          <button type="button" class="ghost" disabled={itemsFull} onclick={() => onAddItem(kind)}
            >{RECEPTION_ITEM_DEFAULTS[kind].name}</button
          >
        {/each}
      </div>
      <form class="custom-form" onsubmit={submitCustom} novalidate>
        <label for="custom-name">Item personalizado</label>
        <div class="inline">
          <input
            id="custom-name"
            maxlength={MAX_NAME}
            autocomplete="off"
            placeholder="Nome do item"
            required
            aria-invalid={customError ? 'true' : undefined}
            aria-describedby={customError ? 'custom-name-error' : undefined}
            bind:value={customName}
            disabled={itemsFull}
          />
          <button type="submit" class="ghost" disabled={itemsFull}>Adicionar</button>
        </div>
        {#if customError}<p class="error" id="custom-name-error" role="alert">{customError}</p>{/if}
      </form>
      {#if itemsFull}<p class="hint">
          Limite de {RECEPTION_LIMITS.maxItems} elementos atingido.
        </p>{/if}
    </section>
  {:else}
    <header class="panel-header">
      <h2>{kindLabel}</h2>
      <p class="hint">Elemento selecionado na planta.</p>
    </header>

    <section class="section" aria-label="Propriedades">
      {#if table}
        {@render nameField()}
        <fieldset class="shape">
          <legend>Formato</legend>
          <label class="radio" class:active={table.shape === 'round'}>
            <input
              type="radio"
              name="table-shape"
              checked={table.shape === 'round'}
              onchange={() => setShape('round')}
            /><span>Redonda</span>
          </label>
          <label class="radio" class:active={table.shape === 'rect'}>
            <input
              type="radio"
              name="table-shape"
              checked={table.shape === 'rect'}
              onchange={() => setShape('rect')}
            /><span>Retangular</span>
          </label>
        </fieldset>
        {#if table.shape === 'round'}
          {@render meters('width', 'Diâmetro (m)', 40, 1000)}
        {:else}
          <div class="pair">
            {@render meters('width', 'Largura (m)', 40, 1000)}
            {@render meters('depth', 'Profundidade (m)', 40, 1000)}
          </div>
        {/if}

        <div class="field">
          <label for="insp-seats">Cadeiras</label>
          <div class="stepper">
            <button
              type="button"
              aria-label="Diminuir cadeiras"
              disabled={table.seats <= RECEPTION_LIMITS.minTableSeats}
              onclick={() => changeSeats(table.seats - 1)}>−</button
            >
            <input
              id="insp-seats"
              type="number"
              min={RECEPTION_LIMITS.minTableSeats}
              max={RECEPTION_LIMITS.maxTableSeats}
              step="1"
              aria-invalid={errors.seats ? 'true' : undefined}
              aria-describedby={errors.seats ? 'insp-seats-error' : undefined}
              value={fields.seats}
              onchange={(event) => changeSeats(Number(event.currentTarget.value))}
              onkeydown={enter}
            />
            <button
              type="button"
              aria-label="Aumentar cadeiras"
              disabled={table.seats >= RECEPTION_LIMITS.maxTableSeats}
              onclick={() => changeSeats(table.seats + 1)}>+</button
            >
          </div>
          {#if errors.seats}<p class="error" id="insp-seats-error" role="alert">
              {errors.seats}
            </p>{/if}
          <p class="hint" aria-live="polite">
            {guests === 1 ? '1 convidado nesta mesa' : `${guests} convidados nesta mesa`}
          </p>
        </div>

        {@render rotationField()}
        {@render position()}
      {:else if item}
        <p class="hint kind-label">Tipo: {kindLabel}</p>
        {@render nameField()}
        <div class="pair">
          {@render meters('width', 'Largura (m)', 10, MAX_POSITION)}
          {@render meters('depth', 'Profundidade (m)', 10, MAX_POSITION)}
        </div>
        {@render rotationField()}
        {@render position()}
      {:else if column}
        <div class="pair">
          {@render meters('width', 'Largura (m)', 10, 1000)}
          {@render meters('depth', 'Profundidade (m)', 10, 1000)}
        </div>
        {@render position()}
      {/if}
    </section>

    <div class="actions">
      {#if !column}
        <button type="button" class="ghost" onclick={() => onDuplicate(selected)}>Duplicar</button>
      {/if}
      <button type="button" class="ghost danger" onclick={() => onRemove(selected)}
        >{table ? 'Remover mesa' : column ? 'Remover coluna' : 'Remover elemento'}</button
      >
      <button type="button" class="ghost" onclick={onClose}>Fechar</button>
    </div>
  {/if}
</div>

<style>
  .inspector {
    box-sizing: border-box;
    width: 100%;
    color: var(--editor-ink, #27342c);
    font:
      14px/1.45 'Segoe UI',
      system-ui,
      sans-serif;
  }
  .panel-header {
    padding-bottom: 10px;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.3;
  }
  .section {
    padding: 12px 0;
    border-top: 1px solid var(--editor-line, #dfe3da);
  }
  .section h3 {
    margin: 0 0 9px;
    font-size: 13px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-heading span {
    color: var(--editor-muted, #626e63);
    font-size: 11px;
  }
  .field {
    margin-bottom: 8px;
  }
  label,
  legend {
    display: block;
    margin: 4px 0;
    padding: 0;
    font-size: 12px;
    font-weight: 600;
  }
  input:not([type='radio']) {
    box-sizing: border-box;
    width: 100%;
    min-height: 40px;
    padding: 7px 9px;
    border: 1px solid var(--field-line, #cfd5ca);
    border-radius: 8px;
    background: #fff;
    color: var(--editor-ink, #27342c);
    font: inherit;
  }
  input[aria-invalid='true'] {
    border-color: #923d35;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .hint {
    margin: 2px 0;
    color: var(--editor-muted, #626e63);
    font-size: 12px;
    line-height: 1.5;
  }
  .error {
    margin: 4px 0;
    color: #923d35;
    font-size: 12px;
  }
  .button-pair,
  .button-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .ghost {
    min-height: 40px;
    padding: 6px 10px;
    border: 1px solid var(--editor-line, #dfe3da);
    border-radius: 8px;
    background: transparent;
    color: var(--editor-forest, #295842);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .ghost:hover:not(:disabled) {
    background: #edf3eb;
  }
  .ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ghost.danger {
    color: #923d35;
  }
  .custom-form {
    margin-top: 12px;
  }
  .inline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
  }
  .stepper {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 48px;
    align-items: stretch;
  }
  .stepper button {
    min-height: 40px;
    border: 1px solid var(--editor-line, #dfe3da);
    background: var(--editor-surface, #fffefb);
    color: var(--editor-forest, #295842);
    font: inherit;
    cursor: pointer;
  }
  .stepper button:first-child {
    border-radius: 8px 0 0 8px;
  }
  .stepper button:last-child {
    border-radius: 0 8px 8px 0;
  }
  .stepper button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .stepper input {
    border-radius: 0;
    text-align: center;
  }
  fieldset.shape {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin: 0 0 8px;
    padding: 0;
    border: 0;
  }
  fieldset.shape legend {
    grid-column: 1 / -1;
  }
  .radio {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    margin: 0;
    border: 1px solid var(--editor-line, #dfe3da);
    border-radius: 8px;
    color: var(--editor-muted, #626e63);
    cursor: pointer;
  }
  .radio.active {
    border-color: #96ae97;
    background: #edf3eb;
    color: var(--editor-forest, #295842);
    font-weight: 700;
  }
  .radio input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .radio:has(input:focus-visible) {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .actions {
    display: grid;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--editor-line, #dfe3da);
  }
  .inspector :focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
</style>
