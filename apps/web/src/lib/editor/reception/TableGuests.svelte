<script lang="ts">
  import type { Project } from '@enlace/contracts';
  import { GUEST_CATEGORIES } from '../guest-categories';
  import type { TableGuestsProps } from './contracts';

  type Guest = Project['guests'][number];

  let {
    project,
    selectedTableId,
    selectedGuestId,
    onSelectGuest,
    onSelectTable,
    onAssign,
    onUnassign,
  }: TableGuestsProps = $props();

  let search = $state('');

  const normalize = (text: string) =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

  const guests = $derived(project.guests);
  const tables = $derived(project.reception.tables);
  const assignments = $derived(project.reception.tableAssignments);

  const guestById = $derived(new Map(guests.map((guest) => [guest.id, guest])));
  const tableOfGuest = $derived(
    new Map(assignments.map((assignment) => [assignment.guestId, assignment.tableId])),
  );
  // Convidados de cada mesa, na ordem das atribuições.
  const guestsByTable = $derived.by(() => {
    const lists: Record<string, Guest[]> = {};
    for (const assignment of assignments) {
      const guest = guestById.get(assignment.guestId);
      if (guest) (lists[assignment.tableId] ??= []).push(guest);
    }
    return new Map(Object.entries(lists));
  });
  const seatedCount = $derived(tableOfGuest.size);
  const unseated = $derived(guests.filter((guest) => !tableOfGuest.has(guest.id)));
  const searchText = $derived(
    new Map(unseated.map((guest) => [guest.id, normalize(`${guest.name} ${guest.note}`)])),
  );
  const visibleUnseated = $derived.by(() => {
    const needle = normalize(search.trim());
    if (!needle) return unseated;
    return unseated.filter((guest) => searchText.get(guest.id)!.includes(needle));
  });
  const selectedGuest = $derived(selectedGuestId ? guestById.get(selectedGuestId) : undefined);

  const occupancyLabel = (tableId: string, seats: number) =>
    `${guestsByTable.get(tableId)?.length ?? 0}/${seats}`;

  function assignFrom(event: Event, guestId: string) {
    const select = event.currentTarget as HTMLSelectElement;
    const tableId = select.value;
    if (tableId) onAssign(guestId, tableId);
    // Controlado pelo projeto: volta ao valor real até o editor aplicar a mudança.
    select.value = tableOfGuest.get(guestId) ?? '';
  }
</script>

<div class="table-guests">
  <header class="panel-header">
    <h2>Convidados por mesa</h2>
    <span class="summary">{seatedCount} de {guests.length} convidados com mesa</span>
  </header>

  {#if guests.length === 0}
    <p class="empty">Cadastre convidados na aba Cerimônia (lista de pessoas) ou importe um CSV.</p>
  {/if}
  {#if tables.length === 0}
    <p class="empty">Adicione mesas na planta para distribuir os convidados.</p>
  {/if}

  {#if selectedGuest}
    <div class="selection-banner" role="status">
      <span>Toque em uma mesa para sentar <strong>{selectedGuest.name}</strong>.</span>
      <button
        type="button"
        class="icon-button"
        aria-label="Cancelar seleção"
        onclick={() => onSelectGuest(null)}>×</button
      >
    </div>
  {/if}

  {#if guests.length > 0}
    <section class="block" aria-labelledby="unseated-title">
      <div class="block-heading">
        <h3 id="unseated-title">Sem mesa</h3>
        <span>{unseated.length}</span>
      </div>
      {#if unseated.length > 0}
        <label class="search-label" for="table-guest-search">Buscar convidados sem mesa</label>
        <input
          id="table-guest-search"
          class="search"
          type="search"
          bind:value={search}
          autocomplete="off"
          placeholder="Buscar por nome ou anotação"
        />
      {/if}
      {#if unseated.length === 0}
        <p class="empty">Todos os convidados já têm mesa.</p>
      {:else if visibleUnseated.length === 0}
        <p class="empty">Nenhuma pessoa encontrada.</p>
      {/if}
      <ul class="guest-list">
        {#each visibleUnseated as guest (guest.id)}
          <li class="guest-row">
            <button
              class="guest-choice"
              type="button"
              aria-pressed={selectedGuestId === guest.id}
              onclick={() => onSelectGuest(selectedGuestId === guest.id ? null : guest.id)}
            >
              <span
                class="guest-dot"
                style={`--category-fill:${GUEST_CATEGORIES[guest.category].fill};--category-stroke:${GUEST_CATEGORIES[guest.category].stroke}`}
              ></span>
              <span class="guest-copy"
                ><strong>{guest.name}</strong><small>{GUEST_CATEGORIES[guest.category].label}</small
                ></span
              >
            </button>
            {#if tables.length > 0}
              <label class="table-select">
                <span class="sr-only">Mesa de {guest.name}</span>
                <select value="" onchange={(event) => assignFrom(event, guest.id)}>
                  <option value="">Sentar em…</option>
                  {#each tables as table (table.id)}
                    <option value={table.id}
                      >{table.name} ({occupancyLabel(table.id, table.seats)})</option
                    >
                  {/each}
                </select>
              </label>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#each tables as table (table.id)}
    {@const list = guestsByTable.get(table.id) ?? []}
    {@const over = list.length > table.seats}
    <section
      class="block table-block"
      class:selected={selectedTableId === table.id}
      aria-label={table.name}
    >
      <button
        class="table-heading"
        type="button"
        aria-current={selectedTableId === table.id ? 'true' : undefined}
        aria-label={selectedGuest
          ? `Sentar ${selectedGuest.name} na ${table.name}`
          : `${table.name}, ${list.length} de ${table.seats} lugares`}
        onclick={() => onSelectTable(table.id)}
      >
        <span class="table-name">{table.name}</span>
        <span class="occupancy" class:over
          >{list.length}/{table.seats}{#if over}
            · acima da capacidade{/if}</span
        >
      </button>
      {#if list.length === 0}
        <p class="empty">Nenhum convidado</p>
      {:else}
        <ul class="guest-list">
          {#each list as guest (guest.id)}
            <li class="guest-row">
              <div class="guest-line">
                <span
                  class="guest-dot"
                  style={`--category-fill:${GUEST_CATEGORIES[guest.category].fill};--category-stroke:${GUEST_CATEGORIES[guest.category].stroke}`}
                ></span>
                <span class="guest-copy"><strong>{guest.name}</strong></span>
                <button
                  class="text-button"
                  type="button"
                  aria-label={`Tirar ${guest.name} da ${table.name}`}
                  onclick={() => onUnassign(guest.id)}>Tirar da mesa</button
                >
              </div>
              <label class="table-select">
                <span class="sr-only">Mover {guest.name} para outra mesa</span>
                <select value={table.id} onchange={(event) => assignFrom(event, guest.id)}>
                  {#each tables as option (option.id)}
                    <option value={option.id}
                      >{option.name} ({occupancyLabel(option.id, option.seats)})</option
                    >
                  {/each}
                </select>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>

<style>
  .table-guests {
    --tg-forest: var(--editor-forest, #295842);
    --tg-surface: var(--editor-surface, #fffefb);
    --tg-muted: var(--editor-muted, #626e63);
    --tg-line: var(--editor-line, #dfe3da);
    --tg-ink: var(--editor-ink, #27342c);
    --tg-error: #923d35;
    box-sizing: border-box;
    width: 100%;
    color: var(--tg-ink);
    font:
      14px/1.45 'Segoe UI',
      system-ui,
      sans-serif;
  }
  .panel-header {
    margin-bottom: 12px;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.2;
  }
  .summary {
    color: var(--tg-muted);
    font-size: 12px;
  }
  .empty {
    margin: 8px 0;
    color: var(--tg-muted);
    font-size: 12px;
  }
  .selection-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 0 12px;
    padding: 9px;
    border: 1px solid #b8cbb7;
    border-radius: 8px;
    background: #f0f5ef;
    font-size: 12px;
  }
  .icon-button,
  .text-button {
    min-height: 36px;
    border: 0;
    background: transparent;
    color: var(--tg-forest);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .icon-button {
    min-width: 36px;
    font-size: 20px;
  }
  .text-button {
    padding: 4px 7px;
    font-size: 12px;
    white-space: nowrap;
  }
  .block {
    padding: 12px 0;
    border-top: 1px solid var(--tg-line);
  }
  .block-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .block-heading h3 {
    margin: 0;
    font-size: 13px;
  }
  .block-heading span {
    color: var(--tg-muted);
    font-size: 11px;
  }
  .search-label {
    display: block;
    margin: 8px 0 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .table-guests input,
  .table-guests select {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    border: 1px solid var(--field-line, #c9cfc4);
    border-radius: 7px;
    padding: 6px 9px;
    background: #fff;
    color: var(--tg-ink);
    font: inherit;
  }
  .search {
    margin-bottom: 8px;
  }
  .table-guests :focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .guest-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .guest-row {
    margin: 4px 0;
    padding: 5px;
    border: 1px solid transparent;
    border-radius: 8px;
    /* Linhas fora da área visível não entram em estilo/layout/pintura (300 convidados). */
    content-visibility: auto;
    contain-intrinsic-size: auto 88px;
  }
  .guest-row:focus-within {
    border-color: var(--tg-line);
  }
  .guest-choice {
    display: flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    gap: 8px;
    padding: 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .guest-choice[aria-pressed='true'] {
    background: #edf3eb;
  }
  .guest-line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
  }
  .guest-dot {
    flex: 0 0 10px;
    width: 10px;
    height: 10px;
    border: 1px solid var(--category-stroke);
    border-radius: 50%;
    background: var(--category-fill);
  }
  .guest-copy {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .guest-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .guest-copy small {
    color: var(--tg-muted);
  }
  .table-select {
    display: block;
    margin-top: 4px;
  }
  .table-select select {
    min-height: 34px;
    font-size: 12px;
  }
  .table-block.selected {
    margin: 0 -6px;
    padding-right: 6px;
    padding-left: 6px;
    background: #f0f5ef;
    border-radius: 8px;
  }
  .table-heading {
    display: flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px;
    border: 1px solid var(--tg-line);
    border-radius: 7px;
    background: var(--tg-surface);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .table-block.selected .table-heading {
    border-color: var(--tg-forest);
  }
  .table-name {
    font-size: 13px;
    font-weight: 700;
  }
  .occupancy {
    color: var(--tg-muted);
    font-size: 12px;
  }
  .occupancy.over {
    color: var(--tg-error);
    font-weight: 700;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .table-guests input,
    .table-guests select {
      min-height: 42px;
    }
  }
</style>
