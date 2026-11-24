<script lang="ts">
  import {
    RECEPTION_DOOR_OPENINGS,
    RECEPTION_LIMITS,
    findRoomOutlineError,
    type ReceptionDoor,
    type RoomPoint,
  } from '@enlace/contracts';
  import {
    createLShapeOutline,
    createOutlineFromWalls,
    createRectangleOutline,
    createSquareOutline,
    formatMeters,
    parseMeters,
    type WallDirection,
  } from '@enlace/domain/reception';
  import type { RoomSetupProps } from './contracts';

  let {
    outline,
    doors,
    onApplyOutline,
    onAddDoor,
    onRemoveDoor,
    selectedDoorId,
    onSelectDoor,
    onAddColumn,
  }: RoomSetupProps = $props();

  const openingLabels: Record<ReceptionDoor['opening'], string> = {
    inward: 'Para dentro',
    outward: 'Para fora',
    sliding: 'De correr',
  };

  type Kind = 'rect' | 'square' | 'l' | 'manual';
  type WallRow = { id: number; direction: WallDirection; length: string };

  const MAX_CM = RECEPTION_LIMITS.maxCoordinate;
  const directions: { value: WallDirection; label: string }[] = [
    { value: 'right', label: 'Direita' },
    { value: 'down', label: 'Baixo' },
    { value: 'left', label: 'Esquerda' },
    { value: 'up', label: 'Cima' },
  ];
  const kinds: { value: Kind; label: string }[] = [
    { value: 'rect', label: 'Retangular' },
    { value: 'square', label: 'Quadrado' },
    { value: 'l', label: 'Em L' },
    { value: 'manual', label: 'Manual' },
  ];

  let nextWallId = 0;
  const defaultWalls = (): WallRow[] => [
    { id: nextWallId++, direction: 'right', length: '10' },
    { id: nextWallId++, direction: 'down', length: '8' },
    { id: nextWallId++, direction: 'left', length: '10' },
    { id: nextWallId++, direction: 'up', length: '8' },
  ];

  let kind = $state<Kind>('rect');
  let width = $state('20');
  let depth = $state('15');
  let side = $state('15');
  let cutWidth = $state('6');
  let cutDepth = $state('5');
  let walls = $state<WallRow[]>(defaultWalls());
  let outlineError = $state('');

  let doorWall = $state('0');
  let doorOffset = $state('1');
  let doorWidth = $state('1,2');
  let doorOpening = $state<ReceptionDoor['opening']>('inward');
  let doorError = $state('');

  // Preenche largura e profundidade quando o contorno atual é um retângulo.
  $effect(() => {
    if (outline && outline.length === 4) {
      const xs = outline.map((point) => point.x);
      const ys = outline.map((point) => point.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const d = Math.max(...ys) - Math.min(...ys);
      if (w > 0 && d > 0) {
        width = formatMeters(w);
        depth = formatMeters(d);
        side = formatMeters(Math.max(w, d));
      }
    }
  });

  const wallLengths = $derived(
    outline
      ? outline.map((start, index) => {
          const end = outline[(index + 1) % outline.length]!;
          return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
        })
      : [],
  );

  $effect(() => {
    if (Number(doorWall) >= wallLengths.length) doorWall = '0';
  });

  function measure(text: string, label: string): number {
    const value = parseMeters(text);
    if (value === null) throw new Error(`${label}: informe um número em metros, como 12,5.`);
    if (value <= 0) throw new Error(`${label}: use um valor maior que zero.`);
    if (value > MAX_CM) throw new Error(`${label}: o máximo é 100 m.`);
    return value;
  }

  function buildOutline(): RoomPoint[] {
    if (kind === 'rect')
      return createRectangleOutline(measure(width, 'Largura'), measure(depth, 'Profundidade'));
    if (kind === 'square') return createSquareOutline(measure(side, 'Lado'));
    if (kind === 'l')
      return createLShapeOutline(
        measure(width, 'Largura'),
        measure(depth, 'Profundidade'),
        measure(cutWidth, 'Largura do recorte'),
        measure(cutDepth, 'Profundidade do recorte'),
      );
    return createOutlineFromWalls(
      walls.map((wall, index) => ({
        direction: wall.direction,
        length: measure(wall.length, `Parede ${index + 1}`),
      })),
    );
  }

  function applyOutline(event: SubmitEvent) {
    event.preventDefault();
    try {
      const result = buildOutline();
      const problem = findRoomOutlineError(result);
      if (problem) throw new Error(problem);
      outlineError = '';
      onApplyOutline(result);
    } catch (error) {
      outlineError = error instanceof Error ? error.message : 'Não foi possível criar o salão.';
    }
  }

  function addWall() {
    if (walls.length >= RECEPTION_LIMITS.maxOutlinePoints) return;
    walls.push({ id: nextWallId++, direction: 'right', length: '' });
  }

  function removeWall(id: number) {
    if (walls.length <= 4) return;
    walls = walls.filter((wall) => wall.id !== id);
  }

  function submitDoor(event: SubmitEvent) {
    event.preventDefault();
    const wall = Number(doorWall);
    const length = wallLengths[wall];
    const offset = parseMeters(doorOffset);
    const doorWidthCm = parseMeters(doorWidth);
    if (length === undefined) {
      doorError = 'Escolha uma parede.';
    } else if (offset === null) {
      doorError = 'Distância do início: informe um número em metros, como 1,5.';
    } else if (doorWidthCm === null || doorWidthCm < 40 || doorWidthCm > 1000) {
      doorError = 'Largura da porta: use entre 0,4 e 10 m.';
    } else if (offset + doorWidthCm > length) {
      doorError = `A porta não cabe: a parede tem ${formatMeters(length)} m.`;
    } else {
      doorError = '';
      onAddDoor({ wall, offset, width: doorWidthCm, opening: doorOpening });
    }
  }

  const doorsFull = $derived(doors.length >= RECEPTION_LIMITS.maxDoors);
</script>

{#snippet form()}
  <form class="room-form" onsubmit={applyOutline} novalidate>
    <fieldset class="kinds">
      <legend>Formato do salão</legend>
      {#each kinds as option (option.value)}
        <label class="kind" class:active={kind === option.value}>
          <input type="radio" name="room-kind" value={option.value} bind:group={kind} />
          <span>{option.label}</span>
        </label>
      {/each}
    </fieldset>

    {#if kind === 'rect' || kind === 'l'}
      <div class="pair">
        <div>
          <label for="room-width">Largura (m)</label>
          <input id="room-width" inputmode="decimal" autocomplete="off" bind:value={width} />
        </div>
        <div>
          <label for="room-depth">Profundidade (m)</label>
          <input id="room-depth" inputmode="decimal" autocomplete="off" bind:value={depth} />
        </div>
      </div>
    {/if}
    {#if kind === 'square'}
      <label for="room-side">Lado (m)</label>
      <input id="room-side" inputmode="decimal" autocomplete="off" bind:value={side} />
    {/if}
    {#if kind === 'l'}
      <p class="hint">O recorte fica no canto superior direito do salão.</p>
      <div class="pair">
        <div>
          <label for="room-cut-width">Recorte: largura (m)</label>
          <input id="room-cut-width" inputmode="decimal" autocomplete="off" bind:value={cutWidth} />
        </div>
        <div>
          <label for="room-cut-depth">Recorte: profundidade (m)</label>
          <input id="room-cut-depth" inputmode="decimal" autocomplete="off" bind:value={cutDepth} />
        </div>
      </div>
    {/if}
    {#if kind === 'manual'}
      <p class="hint">
        Descreva as paredes em sequência, a partir do canto superior esquerdo. A última parede
        precisa voltar ao ponto de partida, e todas formam ângulo reto.
      </p>
      <ol class="walls">
        {#each walls as wall, index (wall.id)}
          <li class="wall-row">
            <span class="wall-number">{index + 1}</span>
            <select aria-label={`Direção da parede ${index + 1}`} bind:value={wall.direction}>
              {#each directions as direction (direction.value)}
                <option value={direction.value}>{direction.label}</option>
              {/each}
            </select>
            <input
              aria-label={`Comprimento da parede ${index + 1} em metros`}
              inputmode="decimal"
              autocomplete="off"
              placeholder="m"
              bind:value={wall.length}
            />
            <button
              type="button"
              class="icon-button"
              aria-label={`Remover parede ${index + 1}`}
              title={`Remover parede ${index + 1}`}
              disabled={walls.length <= 4}
              onclick={() => removeWall(wall.id)}>×</button
            >
          </li>
        {/each}
      </ol>
      <button
        type="button"
        class="ghost"
        disabled={walls.length >= RECEPTION_LIMITS.maxOutlinePoints}
        onclick={addWall}>Adicionar parede</button
      >
    {/if}

    {#if outlineError}<p class="error" role="alert">{outlineError}</p>{/if}
    <button class="primary" type="submit">{outline ? 'Aplicar novo formato' : 'Criar salão'}</button
    >
    <p class="note">
      As medidas e avisos de espaçamento são indicativos e não substituem o projeto do local nem as
      normas de segurança.
    </p>
  </form>
{/snippet}

<div class="room-setup">
  {#if !outline}
    <header class="panel-header">
      <h2>Desenhe o salão da festa</h2>
      <p class="hint">Escolha o formato e informe as medidas em metros.</p>
    </header>
    {@render form()}
  {:else}
    <details class="section">
      <summary>Salão</summary>
      {@render form()}
    </details>

    <section class="section" aria-labelledby="doors-title">
      <div class="section-heading">
        <h3 id="doors-title">Portas</h3>
        <span>{doors.length} / {RECEPTION_LIMITS.maxDoors}</span>
      </div>
      {#if doors.length > 0}
        <ul class="door-list">
          {#each doors as door, index (door.id)}
            <li class:selected={door.id === selectedDoorId}>
              <button
                type="button"
                class="door-select"
                aria-current={door.id === selectedDoorId ? 'true' : undefined}
                aria-label={`Editar porta ${index + 1}`}
                onclick={() => onSelectDoor(door.id)}
              >
                Porta {index + 1} · parede {door.wall + 1} · a {formatMeters(door.offset)} m do início
                · {formatMeters(door.width)} m · {openingLabels[door.opening].toLowerCase()}
              </button>
              <button
                type="button"
                class="ghost small"
                aria-label={`Remover porta ${index + 1}`}
                onclick={() => onRemoveDoor(door.id)}>Remover</button
              >
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Nenhuma porta. As portas aparecem na planta e ajudam a ler as passagens.</p>
      {/if}
      <form class="door-form" onsubmit={submitDoor} novalidate>
        <label for="door-wall">Parede</label>
        <select id="door-wall" bind:value={doorWall} disabled={doorsFull}>
          {#each wallLengths as length, index (index)}
            <option value={String(index)}>Parede {index + 1} ({formatMeters(length)} m)</option>
          {/each}
        </select>
        <div class="pair">
          <div>
            <label for="door-offset">Distância do início (m)</label>
            <input
              id="door-offset"
              inputmode="decimal"
              autocomplete="off"
              bind:value={doorOffset}
              disabled={doorsFull}
            />
          </div>
          <div>
            <label for="door-width">Largura (m)</label>
            <input
              id="door-width"
              inputmode="decimal"
              autocomplete="off"
              bind:value={doorWidth}
              disabled={doorsFull}
            />
          </div>
        </div>
        <fieldset class="openings">
          <legend>Abertura</legend>
          {#each RECEPTION_DOOR_OPENINGS as opening (opening)}
            <button
              type="button"
              class="segment"
              class:active={doorOpening === opening}
              aria-pressed={doorOpening === opening}
              disabled={doorsFull}
              onclick={() => (doorOpening = opening)}>{openingLabels[opening]}</button
            >
          {/each}
        </fieldset>
        <p class="hint">Depois de adicionar, arraste a porta na planta ao longo das paredes.</p>
        {#if doorError}<p class="error" role="alert">{doorError}</p>{/if}
        {#if doorsFull}<p class="hint">
            Limite de {RECEPTION_LIMITS.maxDoors} portas atingido.
          </p>{/if}
        <button class="ghost" type="submit" disabled={doorsFull}>Adicionar porta</button>
      </form>
    </section>

    <section class="section" aria-labelledby="columns-title">
      <h3 id="columns-title">Colunas</h3>
      <p class="hint">
        Pilares do local entram nos avisos de espaçamento. Depois, arraste na planta.
      </p>
      <button class="ghost" type="button" onclick={onAddColumn}>Adicionar coluna</button>
    </section>
  {/if}
</div>

<style>
  .room-setup {
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
  summary {
    min-height: 40px;
    align-content: center;
    color: var(--editor-forest, #295842);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
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
  .room-form {
    display: grid;
    gap: 6px;
  }
  fieldset.kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
    margin: 0 0 4px;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 6px;
    padding: 0;
    font-size: 12px;
    font-weight: 600;
  }
  .kind {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 6px;
    border: 1px solid var(--editor-line, #dfe3da);
    border-radius: 8px;
    color: var(--editor-muted, #626e63);
    font-size: 12px;
    cursor: pointer;
  }
  .kind.active {
    border-color: #96ae97;
    background: #edf3eb;
    color: var(--editor-forest, #295842);
    font-weight: 700;
  }
  .kind input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .kind:has(input:focus-visible) {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  label {
    display: block;
    margin: 4px 0;
    font-size: 12px;
    font-weight: 600;
  }
  input:not([type='radio']),
  select {
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
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .hint,
  .note {
    margin: 2px 0;
    color: var(--editor-muted, #626e63);
    font-size: 12px;
    line-height: 1.5;
  }
  .note {
    font-size: 11px;
  }
  .walls {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .wall-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1.2fr) minmax(0, 1fr) 40px;
    align-items: center;
    gap: 6px;
  }
  .wall-number {
    color: var(--editor-muted, #626e63);
    font-size: 12px;
    text-align: center;
  }
  .icon-button {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--editor-muted, #626e63);
    font-size: 20px;
    cursor: pointer;
  }
  .icon-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .primary,
  .ghost {
    min-height: 40px;
    padding: 6px 12px;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    margin-top: 4px;
    border: 0;
    background: var(--editor-forest, #295842);
    color: #fff;
  }
  .ghost {
    width: 100%;
    border: 1px dashed #9eae9e;
    background: transparent;
    color: var(--editor-forest, #295842);
  }
  .ghost.small {
    width: auto;
    min-width: 40px;
    flex: none;
    border-style: solid;
    border-color: var(--editor-line, #dfe3da);
    font-size: 12px;
  }
  .ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .door-list {
    display: grid;
    gap: 6px;
    margin: 0 0 10px;
    padding: 0;
    list-style: none;
  }
  .door-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--editor-line, #dfe3da);
    border-radius: 8px;
    font-size: 12px;
  }
  .door-list li.selected {
    border-color: #96ae97;
    background: #edf3eb;
  }
  .door-select {
    min-height: 36px;
    flex: 1;
    padding: 4px 2px;
    border: 0;
    background: transparent;
    color: var(--editor-ink, #27342c);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .door-list li.selected .door-select {
    font-weight: 700;
  }
  fieldset.openings {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  fieldset.openings legend {
    grid-column: 1 / -1;
  }
  .segment {
    min-height: 40px;
    padding: 4px 6px;
    border: 1px solid var(--editor-line, #dfe3da);
    border-radius: 8px;
    background: transparent;
    color: var(--editor-muted, #626e63);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .segment.active {
    border-color: #96ae97;
    background: #edf3eb;
    color: var(--editor-forest, #295842);
    font-weight: 700;
  }
  .segment:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .door-form {
    display: grid;
    gap: 6px;
  }
  .error {
    margin: 4px 0;
    color: #923d35;
    font-size: 12px;
  }
  .room-setup :focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
</style>
