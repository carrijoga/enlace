<script lang="ts">
  import { RECEPTION_ITEM_DEFAULTS, formatMeters } from '@enlace/domain/reception';
  import { sameRef, type ElementListProps, type ReceptionElementRef } from './contracts';

  let { reception, occupancy, warningsById, selected, onSelect }: ElementListProps = $props();

  const tables = $derived(reception.tables);
  const items = $derived(reception.items);
  const columns = $derived(reception.room.columns);

  const position = (x: number, y: number) => `centro a ${formatMeters(x)} m × ${formatMeters(y)} m`;
  const size = (width: number, depth: number) =>
    `${formatMeters(width)} × ${formatMeters(depth)} m`;

  function tableText(table: (typeof tables)[number]) {
    const shape =
      table.shape === 'round'
        ? `redonda · ${formatMeters(table.width)} m`
        : `retangular · ${size(table.width, table.depth)}`;
    return `${table.name} · ${shape} · ${occupancy.get(table.id) ?? 0}/${table.seats} lugares · ${position(table.x, table.y)}`;
  }

  function itemText(item: (typeof items)[number]) {
    const kind =
      item.kind === 'custom' ? 'Item personalizado' : RECEPTION_ITEM_DEFAULTS[item.kind].name;
    return `${item.name} · ${kind} · ${size(item.width, item.depth)} · ${position(item.x, item.y)}`;
  }

  const columnText = (index: number, column: (typeof columns)[number]) =>
    `Coluna ${index + 1} · ${size(column.width, column.depth)} · ${position(column.x, column.y)}`;

  const isSelected = (kind: ReceptionElementRef['kind'], id: string) =>
    sameRef(selected, { kind, id });
</script>

<details class="element-list">
  <summary>Ver salão em lista</summary>

  {#if tables.length === 0 && items.length === 0 && columns.length === 0}
    <p class="empty">A planta ainda não tem mesas, elementos nem colunas.</p>
  {/if}

  {#snippet entry(kind: ReceptionElementRef['kind'], id: string, text: string)}
    <li>
      <button
        type="button"
        class="entry"
        aria-pressed={isSelected(kind, id)}
        onclick={() => onSelect({ kind, id })}>{text}</button
      >
      {#each warningsById.get(id) ?? [] as warning (warning)}
        <p class="warning">{warning}</p>
      {/each}
    </li>
  {/snippet}

  {#if tables.length > 0}
    <section aria-labelledby="list-tables">
      <h3 id="list-tables">Mesas ({tables.length})</h3>
      <ul>
        {#each tables as table (table.id)}
          {@render entry('table', table.id, tableText(table))}
        {/each}
      </ul>
    </section>
  {/if}

  {#if items.length > 0}
    <section aria-labelledby="list-items">
      <h3 id="list-items">Elementos ({items.length})</h3>
      <ul>
        {#each items as item (item.id)}
          {@render entry('item', item.id, itemText(item))}
        {/each}
      </ul>
    </section>
  {/if}

  {#if columns.length > 0}
    <section aria-labelledby="list-columns">
      <h3 id="list-columns">Colunas ({columns.length})</h3>
      <ul>
        {#each columns as column, index (column.id)}
          {@render entry('column', column.id, columnText(index, column))}
        {/each}
      </ul>
    </section>
  {/if}
</details>

<style>
  .element-list {
    --el-forest: var(--editor-forest, #295842);
    --el-muted: var(--editor-muted, #626e63);
    --el-line: var(--editor-line, #dfe3da);
    --el-ink: var(--editor-ink, #27342c);
    --el-error: #923d35;
    border-top: 1px solid var(--el-line);
    padding: 8px 0;
    color: var(--el-ink);
    font:
      14px/1.45 'Segoe UI',
      system-ui,
      sans-serif;
  }
  summary {
    min-height: 36px;
    display: flex;
    align-items: center;
    color: var(--el-forest);
    font-weight: 600;
    cursor: pointer;
  }
  summary:focus-visible,
  .entry:focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  h3 {
    margin: 12px 0 4px;
    color: var(--el-muted);
    font-size: 12px;
    font-weight: 700;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    margin: 4px 0;
    /* Até ~200 entradas: fora da área visível não entram em layout/pintura. */
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
  }
  .entry {
    width: 100%;
    min-height: 40px;
    padding: 6px 9px;
    border: 1px solid var(--el-line);
    border-radius: 7px;
    background: #fffefb;
    color: inherit;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .entry[aria-pressed='true'] {
    border-color: var(--el-forest);
    background: #edf3eb;
    font-weight: 600;
  }
  .warning {
    margin: 2px 0 0 9px;
    color: var(--el-error);
    font-size: 12px;
  }
  .empty {
    margin: 8px 0;
    color: var(--el-muted);
    font-size: 12px;
  }
</style>
