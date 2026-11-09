<script lang="ts">
  import type { CeremonyProject } from '@enlace/contracts';
  import { GUEST_CATEGORIES } from './guest-categories';

  // Alternativa em texto à planta SVG (WCAG 1.1.1/2.5.8): mesma seleção e atribuição, sem depender
  // da posição visual. O conteúdo só é montado ao abrir, para não pesar no cenário de 288 cadeiras.
  let {
    project,
    selectedGuestId,
    selectedSeatId,
    onSeatSelect,
    onAssignGuest,
    onUnassignSeat,
  }: {
    project: CeremonyProject;
    selectedGuestId: string | null;
    selectedSeatId: string | null;
    onSeatSelect: (id: string) => void;
    onAssignGuest: (guestId: string, seatId: string) => void;
    onUnassignSeat: (seatId: string) => void;
  } = $props();

  let open = $state(false);
  const rows = $derived(project.layout.rows);
  const total = $derived(
    rows.reduce((sum, row) => sum + row.leftSeatIds.length + row.rightSeatIds.length, 0),
  );
  const guestsById = $derived(new Map(project.guests.map((guest) => [guest.id, guest])));
  const occupantBySeat = $derived(new Map(project.assignments.map((a) => [a.seatId, a.guestId])));
  const selectedGuestName = $derived(
    selectedGuestId ? guestsById.get(selectedGuestId)?.name : undefined,
  );

  function changeOccupant(event: Event, seatId: string) {
    const guestId = (event.currentTarget as HTMLSelectElement).value;
    if (guestId) onAssignGuest(guestId, seatId);
    else onUnassignSeat(seatId);
  }
</script>

{#snippet seatItem(seatId: string, side: string, index: number)}
  {@const guest = guestsById.get(occupantBySeat.get(seatId) ?? '')}
  {@const label = `${side}, cadeira ${index + 1}`}
  <li>
    <button
      type="button"
      aria-pressed={selectedSeatId === seatId}
      onclick={() => onSeatSelect(seatId)}
    >
      <span class="seat-label">{label}</span>
      <span class="occupant" class:free={!guest}
        >{guest ? `${guest.name} · ${GUEST_CATEGORIES[guest.category].label}` : 'Disponível'}</span
      >
    </button>
    {#if selectedSeatId === seatId}
      <div class="occupant-editor">
        <label for="seat-list-guest">Pessoa em {label.toLocaleLowerCase('pt-BR')}</label>
        <select
          id="seat-list-guest"
          value={occupantBySeat.get(seatId) ?? ''}
          onchange={(event) => changeOccupant(event, seatId)}
          disabled={project.guests.length === 0}
        >
          <option value="">Sem pessoa</option>
          {#each project.guests as option (option.id)}
            <option value={option.id}>{option.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  </li>
{/snippet}

<details class="seat-list" bind:open>
  <summary>
    <span>Ver lugares em lista</span>
    <small>{project.assignments.length} de {total} ocupados</small>
  </summary>
  {#if open}
    <p class="help">
      {selectedGuestName
        ? `Escolha a cadeira de ${selectedGuestName}.`
        : 'A mesma planta em texto, do altar para a entrada. Selecione uma cadeira para definir quem senta nela.'}
    </p>
    <div class="rows">
      {#each rows as row, rowIndex (row.id)}
        <section aria-labelledby={`seat-list-row-${row.id}`}>
          <h3 id={`seat-list-row-${row.id}`}>Fileira {rowIndex + 1}</h3>
          <ul>
            {#each row.leftSeatIds as seatId, index (seatId)}
              {@render seatItem(seatId, 'Esquerda', index)}
            {/each}
            {#each row.rightSeatIds as seatId, index (seatId)}
              {@render seatItem(seatId, 'Direita', index)}
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</details>

<style>
  .seat-list {
    margin-bottom: 18px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    font-size: 13px;
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 42px;
    padding: 8px 12px;
    color: var(--green);
    font-weight: 600;
    cursor: pointer;
  }
  small {
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .help {
    margin: 0;
    padding: 0 12px 10px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .rows {
    max-height: 360px;
    overflow-y: auto;
    border-top: 1px solid var(--line);
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  h3 {
    margin: 0;
    padding: 10px 12px 4px;
    font-size: 12px;
    font-weight: 600;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li button {
    display: grid;
    width: 100%;
    min-height: 44px;
    padding: 5px 12px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  li button:hover {
    background: #eaf1e9;
  }
  li button[aria-pressed='true'] {
    background: #edf3eb;
    box-shadow: inset 3px 0 0 var(--green);
  }
  /* A lista rola: o anel fica para dentro para não ser cortado. */
  li button:focus-visible,
  summary:focus-visible {
    outline-offset: -3px;
  }
  .seat-label {
    color: var(--muted);
    font-size: 11px;
  }
  .occupant {
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .occupant.free {
    color: var(--muted);
    font-weight: 400;
  }
  .occupant-editor {
    padding: 4px 12px 12px;
  }
  .occupant-editor label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .occupant-editor select {
    width: 100%;
    min-height: 40px;
    padding: 7px 9px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    background: #fff;
    color: inherit;
    font: inherit;
  }
</style>
