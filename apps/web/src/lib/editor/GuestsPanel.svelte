<script lang="ts">
  import { createUuid, type CeremonyProject } from '@enlace/contracts';
  import { getSeatLabels } from '@enlace/domain';
  import { GUEST_CATEGORIES, GUEST_CATEGORY_OPTIONS, type GuestCategory } from './guest-categories';

  type Guest = CeremonyProject['guests'][number];
  type GuestInput = { id: string; name: string; category: GuestCategory; note: string };
  type GuestPatch = { name: string; category: GuestCategory; note: string };

  let {
    project,
    selectedGuestId,
    selectedSeatId,
    onSelectGuest,
    onAddGuest,
    onUpdateGuest,
    onRemoveGuest,
    onAssignGuest,
    onUnassignSeat,
    onImportCsv,
  }: {
    project: CeremonyProject;
    selectedGuestId: string | null;
    selectedSeatId: string | null;
    onSelectGuest: (id: string | null) => void;
    onAddGuest: (guest: GuestInput) => boolean | void;
    onUpdateGuest: (id: string, patch: GuestPatch) => boolean | void;
    onRemoveGuest: (id: string) => void;
    onAssignGuest: (guestId: string, seatId: string) => void;
    onUnassignSeat: (seatId: string) => void;
    onImportCsv?: (trigger: HTMLButtonElement) => void;
  } = $props();

  let search = $state('');
  let filter = $state<'all' | 'unseated'>('all');
  let newName = $state('');
  let newCategory = $state<GuestCategory>('convidado');
  let newNote = $state('');
  let addError = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editCategory = $state<GuestCategory>('convidado');
  let editNote = $state('');
  let editError = $state('');
  let pendingRemoval = $state<string | null>(null);

  // Derivados intermediários por referência (ADR-0005): trocar só o formato mantém fileiras,
  // convidados e atribuições, então rótulos, mapas e grupos não são recalculados.
  const guests = $derived(project.guests);
  const assignments = $derived(project.assignments);
  const rows = $derived(project.layout.rows);
  const seatByGuest = $derived(new Map(assignments.map((a) => [a.guestId, a.seatId])));
  const seatLabels = $derived(getSeatLabels({ ...project.layout, rows }));
  const labelByGuest = $derived(
    new Map(assignments.map((a) => [a.guestId, seatLabels.get(a.seatId)])),
  );

  const selectedSeatLabel = $derived(selectedSeatId ? seatLabels.get(selectedSeatId) : null);
  const selectedSeatGuestId = $derived(
    selectedSeatId
      ? (project.assignments.find((assignment) => assignment.seatId === selectedSeatId)?.guestId ??
          '')
      : '',
  );
  const unseatedCount = $derived(guests.filter((guest) => !seatByGuest.has(guest.id)).length);
  // Todas as linhas ficam montadas; busca e filtro só alternam `hidden`. Recriar ~300 linhas a
  // cada mudança de filtro custava ~50 ms num celular Android no cenário máximo.
  const groups = $derived(
    GUEST_CATEGORY_OPTIONS.map((category) => ({
      category,
      guests: guests.filter((guest) => guest.category === category.value),
    })),
  );
  const searchText = $derived(
    new Map(guests.map((g) => [g.id, `${g.name} ${g.note}`.toLocaleLowerCase('pt-BR')])),
  );
  const visibleIds = $derived.by(() => {
    const needle = search.trim().toLocaleLowerCase('pt-BR');
    if (!needle && filter === 'all') return null;
    return new Set(
      guests
        .filter(
          (guest) =>
            (!needle || searchText.get(guest.id)!.includes(needle)) &&
            (filter === 'all' || !seatByGuest.has(guest.id)),
        )
        .map((guest) => guest.id),
    );
  });
  const visibleCount = (list: Guest[]) =>
    visibleIds ? list.filter((guest) => visibleIds.has(guest.id)).length : list.length;
  const visibleTotal = $derived(visibleIds ? visibleIds.size : guests.length);

  function addGuest(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      addError = 'Digite o nome do convidado.';
      return;
    }
    if (name.length > 100) {
      addError = 'O nome deve ter até 100 caracteres.';
      return;
    }
    addError = '';
    if (
      onAddGuest({ id: createUuid(), name, category: newCategory, note: newNote.trim() }) === false
    )
      return;
    newName = '';
    newNote = '';
    newCategory = 'convidado';
  }

  function beginEdit(guest: Guest) {
    editingId = guest.id;
    editName = guest.name;
    editCategory = guest.category;
    editNote = guest.note;
    editError = '';
    pendingRemoval = null;
  }

  function saveEdit(event: SubmitEvent, id: string) {
    event.preventDefault();
    const name = editName.trim();
    if (!name) {
      editError = 'Digite o nome do convidado.';
      return;
    }
    if (name.length > 100) {
      editError = 'O nome deve ter até 100 caracteres.';
      return;
    }
    if (onUpdateGuest(id, { name, category: editCategory, note: editNote.trim() }) === false)
      return;
    editingId = null;
  }

  function handleSeatChange(event: Event) {
    if (!selectedSeatId) return;
    const guestId = (event.currentTarget as HTMLSelectElement).value;
    if (guestId) onAssignGuest(guestId, selectedSeatId);
    else onUnassignSeat(selectedSeatId);
  }

  function startDrag(event: DragEvent, guest: Guest) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('application/x-enlace-guest', guest.id);
    event.dataTransfer.setData('text/plain', guest.id);
    event.dataTransfer.effectAllowed = 'move';
    onSelectGuest(guest.id);
  }
</script>

<div class="guests-panel">
  <header class="panel-header">
    <div>
      <h2 id="guests-title">Convidados</h2>
    </div>
    {#if onImportCsv}<button
        class="text-button"
        type="button"
        onclick={(event) => onImportCsv?.(event.currentTarget)}>Importar CSV</button
      >{/if}
    <span class="total">{guests.length}</span>
  </header>

  {#if selectedSeatId}
    <section class="seat-editor" aria-labelledby="seat-editor-title">
      <div class="seat-heading">
        <h3 id="seat-editor-title">{selectedSeatLabel ?? 'Cadeira selecionada'}</h3>
        <button class="text-button" type="button" onclick={() => onUnassignSeat(selectedSeatId!)}
          >Esvaziar</button
        >
      </div>
      <label for="seat-guest">Pessoa nesta cadeira</label>
      <select
        id="seat-guest"
        value={selectedSeatGuestId}
        onchange={handleSeatChange}
        disabled={guests.length === 0}
      >
        <option value="">Sem pessoa</option>
        {#each guests as guest (guest.id)}
          <option value={guest.id}>{guest.name}</option>
        {/each}
      </select>
      {#if guests.length === 0}<p class="hint">Adicione uma pessoa para ocupar este lugar.</p>{/if}
    </section>
  {/if}

  {#if selectedGuestId}
    <div class="selection-banner" role="status">
      <span
        >Toque em uma cadeira para posicionar <strong
          >{guests.find((guest) => guest.id === selectedGuestId)?.name}</strong
        >.</span
      >
      <button
        type="button"
        class="icon-button"
        aria-label="Cancelar seleção"
        onclick={() => onSelectGuest(null)}>×</button
      >
    </div>
  {/if}

  <form class="add-form" onsubmit={addGuest}>
    <h3>Adicionar pessoa</h3>
    <label for="new-guest-name">Nome</label>
    <input
      id="new-guest-name"
      bind:value={newName}
      maxlength="100"
      autocomplete="off"
      placeholder="Nome do convidado"
      aria-invalid={addError ? true : undefined}
      aria-describedby={addError ? 'add-error' : undefined}
    />
    <label for="new-guest-category">Categoria</label>
    <select id="new-guest-category" bind:value={newCategory}>
      {#each GUEST_CATEGORY_OPTIONS as category (category.value)}<option value={category.value}
          >{category.label}</option
        >{/each}
    </select>
    <label for="new-guest-note">Anotação <span class="optional">(opcional)</span></label>
    <textarea
      id="new-guest-note"
      bind:value={newNote}
      maxlength="1000"
      rows="2"
      placeholder="Uma informação útil"></textarea>
    {#if addError}<p class="error" id="add-error" role="alert">{addError}</p>{/if}
    {#if guests.length >= 300}<p class="hint">O limite de 300 convidados foi atingido.</p>{/if}
    <button class="primary-button" type="submit" disabled={guests.length >= 300}
      >Adicionar convidado</button
    >
  </form>

  <section class="guest-list" aria-label="Lista de convidados">
    <div class="list-heading">
      <h3>Pessoas</h3>
      <span>{unseatedCount} sem lugar</span>
    </div>
    <label class="search-label" for="guest-search">Buscar convidados</label>
    <input
      id="guest-search"
      class="search"
      type="search"
      bind:value={search}
      placeholder="Buscar por nome ou anotação"
    />
    <div class="filters" role="group" aria-label="Filtrar convidados">
      <button
        type="button"
        aria-pressed={filter === 'all'}
        class:active={filter === 'all'}
        onclick={() => (filter = 'all')}>Todas</button
      >
      <button
        type="button"
        aria-pressed={filter === 'unseated'}
        class:active={filter === 'unseated'}
        onclick={() => (filter = filter === 'unseated' ? 'all' : 'unseated')}>Sem lugar</button
      >
    </div>
    {#if visibleTotal === 0}
      <p class="empty">
        {guests.length ? 'Nenhuma pessoa encontrada.' : 'Seus convidados aparecerão aqui.'}
      </p>
    {/if}
    {#each groups as { category, guests: group } (category.value)}
      {@const shown = visibleCount(group)}
      {#if group.length}
        <section class="category-group" aria-label={category.label} hidden={shown === 0}>
          <h4>{category.label}<span>{shown}</span></h4>
          {#each group as guest (guest.id)}
            <article
              class="guest-row"
              hidden={visibleIds !== null && !visibleIds.has(guest.id)}
              draggable="true"
              ondragstart={(event) => startDrag(event, guest)}
            >
              <button
                class="guest-choice"
                type="button"
                aria-pressed={selectedGuestId === guest.id}
                class:selected={selectedGuestId === guest.id}
                onclick={() => onSelectGuest(selectedGuestId === guest.id ? null : guest.id)}
              >
                <span
                  class="guest-dot"
                  style={`--category-fill:${GUEST_CATEGORIES[guest.category].fill};--category-stroke:${GUEST_CATEGORIES[guest.category].stroke}`}
                ></span>
                <span class="guest-copy"
                  ><strong>{guest.name}</strong>{#if guest.note}<small>{guest.note}</small
                    >{/if}</span
                >
                {#if seatByGuest.has(guest.id)}<small class="seat-tag"
                    >{labelByGuest.get(guest.id)}</small
                  >{:else}<small class="seat-tag unseated">Sem lugar</small>{/if}
              </button>
              <button
                class="edit-button"
                type="button"
                aria-label={`Editar ${guest.name}`}
                onclick={() => beginEdit(guest)}>Editar</button
              >
              {#if editingId === guest.id}
                <form class="edit-form" onsubmit={(event) => saveEdit(event, guest.id)}>
                  <label for={`edit-name-${guest.id}`}>Nome</label><input
                    id={`edit-name-${guest.id}`}
                    bind:value={editName}
                    maxlength="100"
                  />
                  <label for={`edit-category-${guest.id}`}>Categoria</label><select
                    id={`edit-category-${guest.id}`}
                    bind:value={editCategory}
                    >{#each GUEST_CATEGORY_OPTIONS as option (option.value)}<option
                        value={option.value}>{option.label}</option
                      >{/each}</select
                  >
                  <label for={`edit-note-${guest.id}`}>Anotação</label><textarea
                    id={`edit-note-${guest.id}`}
                    bind:value={editNote}
                    maxlength="1000"
                    rows="2"></textarea>
                  {#if editError}<p class="error" role="alert">{editError}</p>{/if}
                  <div class="row-actions">
                    <button class="primary-button" type="submit">Salvar</button><button
                      type="button"
                      class="secondary-button"
                      onclick={() => (editingId = null)}>Cancelar</button
                    >
                  </div>
                </form>
              {:else if pendingRemoval === guest.id}
                <div
                  class="remove-confirm"
                  role="group"
                  aria-label={`Confirmar remoção de ${guest.name}`}
                >
                  <p>
                    Remover <strong>{guest.name}</strong> da lista? A pessoa também será retirada da cadeira.
                  </p>
                  <div class="row-actions">
                    <button
                      class="danger-button"
                      type="button"
                      onclick={() => {
                        onRemoveGuest(guest.id);
                        pendingRemoval = null;
                      }}>Remover</button
                    ><button
                      class="secondary-button"
                      type="button"
                      onclick={() => (pendingRemoval = null)}>Cancelar</button
                    >
                  </div>
                </div>
              {:else}
                <div class="row-actions compact-actions">
                  <button
                    type="button"
                    class="secondary-button"
                    onclick={() => (pendingRemoval = guest.id)}>Remover</button
                  >
                </div>
              {/if}
            </article>
          {/each}
        </section>
      {/if}
    {/each}
  </section>
</div>

<style>
  .guests-panel {
    --guest-forest: var(--editor-forest, #295842);
    --guest-surface: var(--editor-surface, #fffefb);
    --guest-muted: var(--editor-muted, #626e63);
    --guest-line: var(--editor-line, #dfe3da);
    --guest-ink: var(--editor-ink, #27342c);
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    padding: 0;
    background: transparent;
    color: var(--guest-ink);
    font:
      14px/1.45 'Segoe UI',
      system-ui,
      sans-serif;
  }
  .panel-header,
  .seat-heading,
  .list-heading,
  .row-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .panel-header {
    margin-bottom: 14px;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.2;
  }
  .total {
    display: grid;
    min-width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid var(--guest-line);
    border-radius: 50%;
    font-weight: 700;
    color: var(--guest-forest);
  }
  .seat-editor,
  .add-form {
    padding: 12px 0;
    border-top: 1px solid var(--guest-line);
  }
  .seat-heading h3,
  .add-form h3,
  .list-heading h3 {
    margin: 0;
    font-size: 13px;
  }
  .seat-heading {
    margin-bottom: 8px;
  }
  .seat-editor label,
  .add-form label,
  .edit-form label,
  .search-label {
    display: block;
    margin: 8px 0 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .guests-panel input,
  .guests-panel select,
  .guests-panel textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    padding: 8px 9px;
    background: #fff;
    color: var(--guest-ink);
    font: inherit;
  }
  .guests-panel textarea {
    resize: vertical;
  }
  .guests-panel :focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .hint,
  .empty {
    margin: 8px 0;
    color: var(--guest-muted);
    font-size: 12px;
  }
  .text-button,
  .icon-button {
    min-height: 36px;
    border: 0;
    background: transparent;
    color: var(--guest-forest);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
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
  .icon-button {
    min-width: 36px;
    font-size: 20px;
  }
  .add-form h3 {
    margin-bottom: 8px;
  }
  .optional {
    color: var(--guest-muted);
    font-weight: 400;
  }
  .primary-button,
  .secondary-button,
  .danger-button {
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid var(--guest-line);
    border-radius: 7px;
    background: var(--guest-surface);
    color: var(--guest-forest);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary-button {
    width: 100%;
    margin-top: 10px;
    border-color: var(--guest-forest);
    background: var(--guest-forest);
    color: white;
  }
  .danger-button {
    border-color: #a94c42;
    color: #8c332b;
  }
  .error {
    margin: 5px 0;
    color: #922f28;
    font-size: 12px;
  }
  .guest-list {
    padding-top: 12px;
    border-top: 1px solid var(--guest-line);
  }
  .list-heading span {
    color: var(--guest-muted);
    font-size: 11px;
  }
  .search {
    margin-bottom: 8px;
  }
  .filters {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .filters button {
    min-height: 34px;
    padding: 5px 10px;
    border: 1px solid var(--guest-line);
    border-radius: 18px;
    background: transparent;
    color: var(--guest-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .filters button.active {
    border-color: #9ab19a;
    background: #edf3eb;
    color: var(--guest-forest);
    font-weight: 700;
  }
  .category-group {
    margin: 10px 0;
  }
  .category-group h4 {
    display: flex;
    justify-content: space-between;
    margin: 0 0 5px;
    color: var(--guest-muted);
    font-size: 11px;
    font-weight: 700;
  }
  .category-group h4 span {
    font-weight: 400;
  }
  .guest-row {
    margin: 4px 0;
    padding: 5px;
    border: 1px solid transparent;
    border-radius: 8px;
    /* Linhas fora da área visível não entram em estilo/layout/pintura (300 convidados). */
    content-visibility: auto;
    contain-intrinsic-size: auto 52px;
  }
  .guest-row[hidden],
  .category-group[hidden] {
    display: none;
  }
  .guest-row:focus-within {
    border-color: var(--guest-line);
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
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .guest-choice.selected,
  .guest-choice[aria-pressed='true'] {
    background: #edf3eb;
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
    overflow: hidden;
    color: var(--guest-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seat-tag {
    max-width: 72px;
    color: var(--guest-forest);
    font-size: 10px;
    text-align: right;
  }
  .seat-tag.unseated {
    color: var(--guest-muted);
  }
  .edit-button {
    min-height: 36px;
    padding: 4px 7px;
    border: 0;
    background: transparent;
    color: var(--guest-forest);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .compact-actions {
    justify-content: flex-end;
  }
  .compact-actions .secondary-button {
    min-height: 32px;
    padding: 4px 8px;
    font-size: 12px;
  }
  .edit-form,
  .remove-confirm {
    padding: 8px 2px;
  }
  .edit-form .row-actions,
  .remove-confirm .row-actions {
    justify-content: flex-start;
    margin-top: 8px;
  }
  .edit-form .primary-button {
    width: auto;
    margin: 0;
  }
  .remove-confirm p {
    margin: 0;
    font-size: 12px;
  }
  .remove-confirm .danger-button,
  .remove-confirm .secondary-button {
    min-height: 36px;
  }
  .empty {
    padding: 8px 0;
  }
  @media (max-width: 640px) {
    .guests-panel {
      width: 100%;
      padding: 0;
    }
    .guests-panel input,
    .guests-panel select,
    .guests-panel textarea {
      min-height: 42px;
    }
    .primary-button,
    .secondary-button,
    .danger-button,
    .text-button,
    .edit-button {
      min-height: 40px;
    }
  }
</style>
