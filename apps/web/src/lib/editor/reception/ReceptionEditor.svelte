<script lang="ts">
  import type { Project, Reception, RoomPoint } from '@enlace/contracts';
  import {
    MIN_PASSAGE_CM,
    addColumn,
    addDoor,
    addItem,
    addTable,
    assignGuestToTable,
    duplicateItem,
    duplicateTable,
    formatMeters,
    getReceptionWarnings,
    getRoomChangeImpact,
    getTableGuestIds,
    getTableSeatReductionImpact,
    removeColumn,
    removeDoor,
    updateDoor,
    removeItem,
    removeTable,
    setRoomOutline,
    setTableSeats,
    snapToGrid,
    unassignGuestFromTable,
    updateColumn,
    updateItem,
    updateTable,
    type ReceptionWarning,
  } from '@enlace/domain/reception';
  import ReceptionCanvas from './ReceptionCanvas.svelte';
  import RoomSetup from './RoomSetup.svelte';
  import ElementInspector from './ElementInspector.svelte';
  import TableGuests from './TableGuests.svelte';
  import ElementList from './ElementList.svelte';
  import { sameRef, type ReceptionElementRef, type ReceptionSelection } from './contracts';

  type Action = (current: Project) => Project;
  let {
    project,
    mutate,
    confirm,
  }: {
    project: Project;
    /** Aplica o comando com desfazer e salvamento; `false` se ele foi recusado. */
    mutate: (action: Action, text?: string) => boolean;
    /** Mostra a confirmação do editor e só aplica depois do "Continuar". */
    confirm: (action: Action, title: string, detail: string) => void;
  } = $props();

  let picked = $state<ReceptionSelection | null>(null);
  let warningsOpen = $state(false);
  let warningsBox = $state<HTMLDetailsElement>();
  let pickedGuestId = $state<string | null>(null);
  let mobilePanel = $state<'room' | 'guests'>('room');

  const reception = $derived(project.reception);
  // Seleções que deixaram de existir (desfazer, remoção) somem sem efeito colateral.
  const selected = $derived.by(() => {
    if (!picked || !reception) return null;
    const list =
      picked.kind === 'table'
        ? reception.tables
        : picked.kind === 'item'
          ? reception.items
          : picked.kind === 'door'
            ? reception.room.doors
            : reception.room.columns;
    return list.some((entry) => entry.id === picked!.id) ? picked : null;
  });
  // A lista de elementos e os avisos tratam só mesas, elementos e colunas.
  const selectedElement = $derived(selected?.kind === 'door' ? null : selected);
  const selectedGuestId = $derived(
    pickedGuestId && project.guests.some((guest) => guest.id === pickedGuestId)
      ? pickedGuestId
      : null,
  );
  const assignments = $derived(reception?.tableAssignments ?? []);
  // Mapas derivados, recriados a cada mudança e nunca alterados depois (sem SvelteMap).
  const occupancy = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const { tableId } of assignments) counts[tableId] = (counts[tableId] ?? 0) + 1;
    return new Map(Object.entries(counts));
  });
  const warnings = $derived(reception ? getReceptionWarnings(reception) : []);
  const names = $derived(
    new Map<string, string>(
      reception
        ? [
            ...reception.tables.map((table) => [table.id, table.name] as const),
            ...reception.items.map((item) => [item.id, item.name] as const),
            ...reception.room.columns.map(
              (column, index) => [column.id, `Coluna ${index + 1}`] as const,
            ),
            ...reception.room.doors.map((door, index) => [door.id, `Porta ${index + 1}`] as const),
          ]
        : [],
    ),
  );
  const nameOf = (ref: ReceptionSelection) => names.get(ref.id) ?? 'Elemento';
  const meters = (cm: number) => `${formatMeters(cm)} m`;

  function describe(warning: ReceptionWarning): string {
    switch (warning.code) {
      case 'outside_room':
        return `${nameOf(warning.element)} está fora do salão.`;
      case 'overlap':
        return `${nameOf(warning.first)} e ${nameOf(warning.second)} se sobrepõem.`;
      case 'narrow_passage':
        return warning.second
          ? `Passagem de ${meters(warning.gap)} entre ${nameOf(warning.first)} e ${nameOf(warning.second)}.`
          : `Passagem de ${meters(warning.gap)} entre ${nameOf(warning.first)} e a parede.`;
      case 'table_over_capacity':
        return `${names.get(warning.tableId) ?? 'Mesa'}: ${warning.guests} convidados para ${warning.seats} cadeiras.`;
    }
  }
  const warningIds = (warning: ReceptionWarning): string[] =>
    warning.code === 'outside_room'
      ? [warning.element.id]
      : warning.code === 'table_over_capacity'
        ? [warning.tableId]
        : [warning.first.id, ...(warning.second ? [warning.second.id] : [])];
  const warningsById = $derived.by(() => {
    const byId: Record<string, string[]> = {};
    for (const warning of warnings) {
      const text = describe(warning);
      for (const id of warningIds(warning)) (byId[id] ??= []).push(text);
    }
    return new Map(Object.entries(byId));
  });
  const warnedIds = $derived(new Set(warningsById.keys()));

  const seats = $derived(reception?.tables.reduce((sum, table) => sum + table.seats, 0) ?? 0);
  const seatedGuests = $derived(assignments.length);
  const selectedGuestName = $derived(
    project.guests.find((guest) => guest.id === selectedGuestId)?.name,
  );
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  function roomCenter(current: Reception) {
    const xs = current.room.outline.map((point) => point.x);
    const ys = current.room.outline.map((point) => point.y);
    return {
      x: snapToGrid((Math.min(...xs) + Math.max(...xs)) / 2),
      y: snapToGrid((Math.min(...ys) + Math.max(...ys)) / 2),
    };
  }
  function selectNewestDoor() {
    const newest = project.reception?.room.doors.at(-1);
    if (newest) picked = { kind: 'door', id: newest.id };
  }
  /** Seleciona o elemento recém-criado, sempre o último da lista. */
  function selectNewest(kind: ReceptionElementRef['kind']) {
    const current = project.reception;
    if (!current) return;
    const list =
      kind === 'table' ? current.tables : kind === 'item' ? current.items : current.room.columns;
    const newest = list.at(-1);
    if (newest) picked = { kind, id: newest.id };
  }

  function applyOutline(outline: RoomPoint[]) {
    if (!reception) {
      if (
        mutate((p) => setRoomOutline(p, outline), 'Salão criado. Agora adicione mesas e atrações.')
      )
        mobilePanel = 'room';
      return;
    }
    const lost = getRoomChangeImpact(project, outline).length;
    if (lost)
      confirm(
        (p) => setRoomOutline(p, outline),
        'Trocar o formato do salão?',
        `${plural(lost, 'porta deixa', 'portas deixam')} de caber nas paredes novas e ${lost === 1 ? 'será removida' : 'serão removidas'}. Mesas e elementos continuam onde estão; você pode desfazer.`,
      );
    else mutate((p) => setRoomOutline(p, outline), 'Salão atualizado.');
  }

  function select(ref: ReceptionSelection | null) {
    if (ref?.kind === 'table' && selectedGuestId) {
      assign(selectedGuestId, ref.id);
      return;
    }
    picked = ref;
  }
  function move(ref: ReceptionElementRef, x: number, y: number) {
    const action: Action =
      ref.kind === 'table'
        ? (p) => updateTable(p, ref.id, { x, y })
        : ref.kind === 'item'
          ? (p) => updateItem(p, ref.id, { x, y })
          : (p) => updateColumn(p, ref.id, { x, y });
    if (mutate(action)) picked = ref;
  }
  function moveDoor(id: string, wall: number, offset: number) {
    if (mutate((p) => updateDoor(p, id, { wall, offset }))) picked = { kind: 'door', id };
  }
  function assign(guestId: string, tableId: string) {
    const guest = project.guests.find((entry) => entry.id === guestId)?.name ?? 'Convidado';
    const table = names.get(tableId) ?? 'mesa';
    if (mutate((p) => assignGuestToTable(p, guestId, tableId), `${guest} em ${table}.`)) {
      pickedGuestId = null;
      picked = { kind: 'table', id: tableId };
    }
  }
  function unassign(guestId: string) {
    mutate((p) => unassignGuestFromTable(p, guestId), 'Convidado sem mesa. Ele continua na lista.');
  }
  function guestNames(ids: readonly string[]) {
    const byId = new Map(project.guests.map((guest) => [guest.id, guest.name]));
    const listed = ids.slice(0, 4).map((id) => byId.get(id) ?? 'Convidado');
    return ids.length > 4 ? `${listed.join(', ')} e mais ${ids.length - 4}` : listed.join(', ');
  }
  function setSeats(id: string, count: number) {
    const displaced = getTableSeatReductionImpact(project, id, count);
    if (displaced.length)
      confirm(
        (p) => setTableSeats(p, id, count),
        'Reduzir as cadeiras da mesa?',
        `${plural(displaced.length, 'pessoa ficará', 'pessoas ficarão')} sem mesa: ${guestNames(displaced)}. Todos continuam na lista e você pode desfazer.`,
      );
    else mutate((p) => setTableSeats(p, id, count), 'Cadeiras atualizadas.');
  }
  function remove(ref: ReceptionSelection) {
    if (ref.kind === 'table') {
      const seated = getTableGuestIds(project, ref.id);
      if (seated.length) {
        confirm(
          (p) => removeTable(p, ref.id),
          `Remover ${nameOf(ref)}?`,
          `${plural(seated.length, 'pessoa ficará', 'pessoas ficarão')} sem mesa: ${guestNames(seated)}. Todos continuam na lista e você pode desfazer.`,
        );
        return;
      }
      mutate((p) => removeTable(p, ref.id), 'Mesa removida.');
    } else if (ref.kind === 'item') mutate((p) => removeItem(p, ref.id), 'Elemento removido.');
    else if (ref.kind === 'door') mutate((p) => removeDoor(p, ref.id), 'Porta removida.');
    else mutate((p) => removeColumn(p, ref.id), 'Coluna removida.');
  }
  function duplicate(ref: ReceptionElementRef) {
    if (ref.kind === 'column') return;
    const ok =
      ref.kind === 'table'
        ? mutate((p) => duplicateTable(p, ref.id), 'Mesa duplicada, sem os convidados.')
        : mutate((p) => duplicateItem(p, ref.id), 'Elemento duplicado.');
    if (ok) selectNewest(ref.kind);
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    if (warningsOpen && !warningsBox?.contains(event.target as Node)) warningsOpen = false;
  }}
  onkeydown={(event) => {
    if (event.key !== 'Escape' || !warningsOpen) return;
    event.preventDefault();
    warningsOpen = false;
    warningsBox?.querySelector('summary')?.focus();
  }}
/>

{#if !reception}
  <div class="reception-start">
    <div class="start-card">
      <h2>Planta da festa</h2>
      <p>
        Comece pelo salão: escolha um formato pronto ou descreva as paredes com as medidas reais.
        Depois posicione mesas, pista, DJ e as demais atrações, e distribua os convidados da
        cerimônia pelas mesas.
      </p>
      <RoomSetup
        outline={null}
        doors={[]}
        onApplyOutline={applyOutline}
        onAddDoor={() => {}}
        onRemoveDoor={() => {}}
        selectedDoorId={null}
        onSelectDoor={() => {}}
        onAddColumn={() => {}}
      />
    </div>
  </div>
{:else}
  <div class="reception-workspace">
    <aside
      class="reception-sidebar"
      class:mobile-hidden={mobilePanel !== 'room'}
      aria-label="Salão e elementos"
    >
      <ElementInspector
        {reception}
        {selected}
        {occupancy}
        onAddTable={(shape) => {
          const center = roomCenter(reception);
          const input =
            shape === 'rect'
              ? { shape, width: 180, depth: 90, seats: 6, ...center }
              : { shape, ...center };
          if (mutate((p) => addTable(p, input), 'Mesa adicionada no centro do salão.'))
            selectNewest('table');
        }}
        onAddItem={(kind, name) => {
          if (
            mutate(
              (p) => addItem(p, kind, { ...roomCenter(reception), ...(name ? { name } : {}) }),
              'Elemento adicionado no centro do salão.',
            )
          )
            selectNewest('item');
        }}
        onUpdateTable={(id, patch) => mutate((p) => updateTable(p, id, patch), 'Mesa atualizada.')}
        onSetSeats={setSeats}
        onUpdateItem={(id, patch) =>
          mutate((p) => updateItem(p, id, patch), 'Elemento atualizado.')}
        onUpdateColumn={(id, patch) =>
          mutate((p) => updateColumn(p, id, patch), 'Coluna atualizada.')}
        onUpdateDoor={(id, patch) => mutate((p) => updateDoor(p, id, patch), 'Porta atualizada.')}
        onDuplicate={duplicate}
        onRemove={remove}
        onClose={() => (picked = null)}
      />
      <RoomSetup
        outline={reception.room.outline}
        doors={reception.room.doors}
        onApplyOutline={applyOutline}
        onAddDoor={(door) => {
          if (
            mutate((p) => addDoor(p, door), 'Porta adicionada. Arraste-a na planta para ajustar.')
          )
            selectNewestDoor();
        }}
        onRemoveDoor={(id) => mutate((p) => removeDoor(p, id), 'Porta removida.')}
        selectedDoorId={selected?.kind === 'door' ? selected.id : null}
        onSelectDoor={(id) => (picked = { kind: 'door', id })}
        onAddColumn={() => {
          if (
            mutate(
              (p) => addColumn(p, { ...roomCenter(reception), width: 40, depth: 40 }),
              'Coluna adicionada no centro do salão.',
            )
          )
            selectNewest('column');
        }}
      />
    </aside>

    <main id="planta-festa" class="reception-plan" aria-label="Planta da festa">
      <div class="plan-heading">
        <div>
          <h2>A festa</h2>
          <p>
            {plural(reception.tables.length, 'mesa', 'mesas')} · {plural(
              seats,
              'cadeira',
              'cadeiras',
            )}
            · {seatedGuests} de {project.guests.length} convidados com mesa
          </p>
        </div>
        <!-- Menu suspenso sobre a planta: avisos novos não mudam a altura nem a escala da planta. -->
        <details
          class="warnings"
          class:has-warnings={warnings.length > 0}
          bind:open={warningsOpen}
          bind:this={warningsBox}
        >
          <summary>
            {warnings.length ? plural(warnings.length, 'aviso', 'avisos') : 'Nenhum aviso'}
          </summary>
          <div class="warnings-panel">
            {#if warnings.length}
              <ul>
                {#each warnings.slice(0, 30) as warning, index (index)}
                  <li>
                    <button
                      type="button"
                      onclick={() => {
                        warningsOpen = false;
                        select(
                          warning.code === 'outside_room'
                            ? warning.element
                            : warning.code === 'table_over_capacity'
                              ? { kind: 'table', id: warning.tableId }
                              : warning.first,
                        );
                      }}>{describe(warning)}</button
                    >
                  </li>
                {/each}
              </ul>
              {#if warnings.length > 30}<p>E mais {warnings.length - 30} avisos.</p>{/if}
            {:else}
              <p>Nada a revisar na disposição atual.</p>
            {/if}
            <p class="disclaimer">
              Avisos são indicativos e não bloqueiam a edição. A passagem de referência é de
              {meters(MIN_PASSAGE_CM)}; as medidas não substituem o projeto do local nem as normas
              de segurança.
            </p>
          </div>
        </details>
      </div>
      <div class="canvas-slot">
        <ReceptionCanvas
          {reception}
          {occupancy}
          {warnedIds}
          {selected}
          assigning={Boolean(selectedGuestId)}
          onSelect={select}
          onMove={move}
          onMoveDoor={moveDoor}
        />
      </div>
      <div class="plan-context" class:waiting={selectedGuestId}>
        <p>
          {selectedGuestName
            ? `Toque na mesa de ${selectedGuestName}.`
            : selected?.kind === 'door'
              ? `${nameOf(selected)} selecionada. Arraste ao longo das paredes ou use as setas para mover 10 cm (Shift: 50 cm).`
              : selected
                ? `${nameOf(selected)} selecionado. Arraste ou use as setas para mover 10 cm (Shift: 50 cm).`
                : 'Toque num elemento para editar. Arraste para mover; a grade encaixa a cada 10 cm.'}
        </p>
      </div>
    </main>

    <nav
      class="reception-tabs"
      aria-label="Ferramentas da festa"
      style:--active-tab={mobilePanel === 'guests' ? 1 : 0}
    >
      <button aria-pressed={mobilePanel === 'room'} onclick={() => (mobilePanel = 'room')}
        >Salão</button
      ><button aria-pressed={mobilePanel === 'guests'} onclick={() => (mobilePanel = 'guests')}
        >Mesas <span>{seatedGuests}/{project.guests.length}</span></button
      >
    </nav>

    <aside
      class="reception-sidebar guests"
      class:mobile-hidden={mobilePanel !== 'guests'}
      aria-label="Convidados por mesa"
    >
      <TableGuests
        project={{ ...project, reception }}
        selectedTableId={selected?.kind === 'table' ? selected.id : null}
        {selectedGuestId}
        onSelectGuest={(id) => {
          pickedGuestId = id;
          if (id && matchMedia('(max-width: 980px)').matches) mobilePanel = 'guests';
        }}
        onSelectTable={(id) => select({ kind: 'table', id })}
        onAssign={assign}
        onUnassign={unassign}
      />
      <ElementList
        {reception}
        {occupancy}
        {warningsById}
        selected={selectedElement}
        onSelect={(ref) => {
          picked = sameRef(picked, ref) ? null : ref;
          mobilePanel = 'room';
        }}
      />
    </aside>
  </div>
{/if}

<style>
  .reception-start {
    flex: 1;
    overflow-y: auto;
    padding: 32px 20px;
    background: #f7f8f3;
  }
  .start-card {
    max-width: 560px;
    margin: 0 auto;
    background: #fffefb;
    border: 1px solid #dfe3da;
    border-radius: 14px;
    padding: 26px 26px 20px;
  }
  .start-card h2,
  .plan-heading h2 {
    font:
      400 23px/1.2 Georgia,
      serif;
    letter-spacing: -0.025em;
    margin: 0 0 6px;
  }
  .start-card > p {
    color: #626e63;
    font-size: 13px;
    line-height: 1.7;
    margin: 0 0 18px;
  }
  .reception-workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr) 292px;
  }
  .reception-sidebar {
    overflow-y: auto;
    min-height: 0;
    background: #f7f8f3;
    scrollbar-width: thin;
    overscroll-behavior: contain;
    padding: 23px 19px;
    border-right: 1px solid #dfe3da;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .reception-sidebar.guests {
    border-right: 0;
    border-left: 1px solid #dfe3da;
  }
  .reception-plan {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fffefb;
    margin: 18px;
    border: 1px solid #dfe3da;
    border-radius: 12px;
    overflow: hidden;
  }
  .plan-heading {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 19px 22px 12px;
    border-bottom: 1px solid #eef0e9;
  }
  .plan-heading p {
    color: #626e63;
    font-size: 11px;
    margin: 0;
  }
  .canvas-slot {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* Altura fixa de duas linhas: trocar o texto não muda a escala da planta. */
  .plan-context {
    flex: none;
    box-sizing: border-box;
    height: calc(2 * 1.6 * 11px + 22px);
    overflow: hidden;
    padding: 11px 19px;
    background: #f3f6ee;
    border-top: 1px solid #e3e9dd;
  }
  .plan-context.waiting {
    background: #faf4e8;
  }
  .plan-context p {
    margin: 0;
    font-size: 11px;
    color: #36543d;
    line-height: 1.6;
  }
  .warnings {
    flex: none;
    font-size: 11px;
  }
  .warnings summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid #dfe3da;
    border-radius: 999px;
    background: #fffefb;
    color: #626e63;
    font-weight: 650;
    cursor: pointer;
    list-style: none;
    white-space: nowrap;
  }
  .warnings summary::-webkit-details-marker {
    display: none;
  }
  .warnings summary::after {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
  }
  .warnings[open] summary::after {
    transform: translateY(1px) rotate(-135deg);
  }
  .warnings.has-warnings summary {
    border-color: #e5c9c2;
    background: #fbf1ee;
    color: #923d35;
  }
  .warnings summary:focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .warnings-panel {
    position: absolute;
    z-index: 5;
    top: calc(100% - 4px);
    right: 16px;
    width: min(360px, calc(100% - 32px));
    max-height: min(320px, 50vh);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 10px 14px 12px;
    background: #fffefb;
    border: 1px solid #dfe3da;
    border-radius: 10px;
    box-shadow: 0 10px 28px rgb(39 52 44 / 14%);
    overscroll-behavior: contain;
  }
  .warnings-panel > p {
    margin: 0;
    color: #36543d;
    line-height: 1.6;
  }
  .warnings ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .warnings button {
    border: 0;
    background: none;
    padding: 4px 0;
    color: #923d35;
    text-align: left;
    font-size: 11px;
    line-height: 1.5;
    cursor: pointer;
  }
  .warnings button:hover {
    text-decoration: underline;
  }
  .warnings button:focus-visible {
    outline: 2px solid #6d936f;
    outline-offset: 1px;
  }
  .warnings-panel .disclaimer {
    color: #626e63;
    margin: 8px 0 0;
    padding-top: 8px;
    border-top: 1px solid #eef0e9;
    line-height: 1.6;
  }
  .reception-tabs {
    display: none;
  }
  @media (max-width: 1200px) {
    .reception-workspace {
      grid-template-columns: 240px minmax(0, 1fr) 260px;
    }
    .reception-sidebar {
      padding-inline: 14px;
    }
    .reception-plan {
      margin: 12px;
    }
  }
  @media (max-width: 980px) {
    .reception-workspace {
      display: flex;
      flex-direction: column;
    }
    .reception-plan {
      order: 0;
      height: min(60dvh, 560px);
      min-height: 340px;
      margin: 12px 12px 0;
    }
    .warnings-panel {
      max-height: 240px;
    }
    .reception-tabs {
      order: 1;
      position: relative;
      display: flex;
      margin: 13px 16px 0;
      border-bottom: 1px solid #cbd7c6;
    }
    .reception-tabs::after {
      content: '';
      position: absolute;
      left: 0;
      bottom: -1px;
      width: 50%;
      height: 2px;
      background: #295842;
      transform: translateX(calc(var(--active-tab) * 100%));
      transition: transform var(--dur-slow) var(--ease-out);
    }
    .reception-tabs button {
      flex: 1;
      background: transparent;
      border: 0;
      padding: 12px 12px 14px;
      color: #626e63;
    }
    .reception-tabs button[aria-pressed='true'] {
      color: #295842;
      font-weight: 650;
    }
    .reception-tabs span {
      margin-left: 5px;
      font-size: 10px;
    }
    .reception-sidebar,
    .reception-sidebar.guests {
      order: 2;
      overflow: visible;
      padding: 24px;
      border: 0;
    }
    .mobile-hidden {
      display: none;
    }
  }
  @media print {
    .reception-sidebar,
    .reception-tabs,
    .plan-context,
    .warnings {
      display: none !important;
    }
    .reception-workspace {
      display: block;
    }
    .reception-plan {
      margin: 0;
      border: 0;
    }
  }
</style>
