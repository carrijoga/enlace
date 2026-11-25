<script lang="ts">
  import {
    GUEST_CATEGORY_COLORS,
    GUEST_CATEGORY_LIMITS,
    type CustomGuestCategory,
    type GuestCategoryColor,
  } from '@enlace/contracts';
  import { CUSTOM_CATEGORY_COLORS } from './guest-categories';

  type Patch = { label?: string; color?: GuestCategoryColor };

  let {
    categories,
    countOf,
    onAdd,
    onUpdate,
    onRemove,
  }: {
    categories: readonly CustomGuestCategory[];
    /** Convidados na categoria; quem estiver nela volta para "Convidado" ao excluí-la. */
    countOf: (id: string) => number;
    /** `false` quando o editor recusou (nome repetido, limite). */
    onAdd: (label: string, color: GuestCategoryColor) => boolean;
    onUpdate: (id: string, patch: Patch) => boolean;
    onRemove: (id: string) => void;
  } = $props();

  const nextColor = (): GuestCategoryColor =>
    GUEST_CATEGORY_COLORS.find((color) => !categories.some((c) => c.color === color)) ??
    GUEST_CATEGORY_COLORS[categories.length % GUEST_CATEGORY_COLORS.length]!;

  let newLabel = $state('');
  let newColor = $state<GuestCategoryColor>(nextColor());
  let editingId = $state<string | null>(null);
  let editLabel = $state('');
  let editColor = $state<GuestCategoryColor>('rosa');
  const full = $derived(categories.length >= GUEST_CATEGORY_LIMITS.maxCustom);

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!onAdd(newLabel, newColor)) return;
    newLabel = '';
    newColor = nextColor();
  }
  function beginEdit(category: CustomGuestCategory) {
    editingId = category.id;
    editLabel = category.label;
    editColor = category.color;
  }
  function save(event: SubmitEvent, id: string) {
    event.preventDefault();
    if (onUpdate(id, { label: editLabel, color: editColor })) editingId = null;
  }
</script>

<details class="categories">
  <summary
    >Categorias personalizadas{#if categories.length}<span>{categories.length}</span>{/if}</summary
  >
  <p class="hint">
    Além de Família, Padrinho, Madrinha, Pajem e Convidado. Cada categoria ganha uma cor na planta.
  </p>
  {#if categories.length}
    <ul>
      {#each categories as category (category.id)}
        {@const colors = CUSTOM_CATEGORY_COLORS[category.color]}
        <li>
          {#if editingId === category.id}
            <form class="category-form" onsubmit={(event) => save(event, category.id)}>
              <label class="sr-only" for={`category-label-${category.id}`}>Nome</label>
              <input
                id={`category-label-${category.id}`}
                bind:value={editLabel}
                maxlength={GUEST_CATEGORY_LIMITS.maxLabelLength}
              />
              <label class="sr-only" for={`category-color-${category.id}`}>Cor</label>
              <select id={`category-color-${category.id}`} bind:value={editColor}>
                {#each GUEST_CATEGORY_COLORS as color (color)}<option value={color}
                    >{CUSTOM_CATEGORY_COLORS[color].label}</option
                  >{/each}
              </select>
              <div class="row-actions">
                <button class="secondary-button" type="submit">Salvar</button>
                <button class="secondary-button" type="button" onclick={() => (editingId = null)}
                  >Cancelar</button
                >
              </div>
            </form>
          {:else}
            <span
              class="swatch"
              style:background={colors.fill}
              style:border-color={colors.stroke}
              aria-hidden="true"
            ></span>
            <span class="name">{category.label}</span>
            <span class="count">{countOf(category.id)}</span>
            <button
              class="text-button"
              type="button"
              aria-label={`Editar categoria ${category.label}`}
              onclick={() => beginEdit(category)}>Editar</button
            >
            <button
              class="text-button danger"
              type="button"
              aria-label={`Excluir categoria ${category.label}`}
              onclick={() => onRemove(category.id)}>Excluir</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <form class="category-form" onsubmit={add}>
    <label for="new-category-label">Nova categoria</label>
    <input
      id="new-category-label"
      bind:value={newLabel}
      maxlength={GUEST_CATEGORY_LIMITS.maxLabelLength}
      autocomplete="off"
      placeholder="Ex.: Amigos da faculdade"
      disabled={full}
    />
    <label for="new-category-color">Cor</label>
    <select id="new-category-color" bind:value={newColor} disabled={full}>
      {#each GUEST_CATEGORY_COLORS as color (color)}<option value={color}
          >{CUSTOM_CATEGORY_COLORS[color].label}</option
        >{/each}
    </select>
    {#if full}<p class="hint">
        Limite de {GUEST_CATEGORY_LIMITS.maxCustom} categorias personalizadas.
      </p>{/if}
    <button class="secondary-button" type="submit" disabled={full}>Criar categoria</button>
  </form>
</details>

<style>
  .categories {
    padding: 10px 0;
    border-top: 1px solid var(--guest-line);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  summary span {
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--guest-surface);
    color: var(--guest-muted);
    font-size: 11px;
  }
  summary:focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .hint {
    margin: 4px 0 8px;
    color: var(--guest-muted);
    font-size: 12px;
  }
  ul {
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    border-bottom: 1px solid var(--guest-line);
  }
  .swatch {
    flex: none;
    width: 14px;
    height: 14px;
    border: 1.5px solid;
    border-radius: 4px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .count {
    color: var(--guest-muted);
    font-size: 12px;
  }
  .text-button {
    min-height: 32px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--guest-forest);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .text-button.danger {
    color: #8c332b;
  }
  .category-form {
    flex: 1;
    padding: 6px 0;
  }
  .category-form label {
    display: block;
    margin: 6px 0 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .category-form input,
  .category-form select {
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    margin-bottom: 6px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    padding: 8px 9px;
    background: #fff;
    color: var(--guest-ink);
    font: inherit;
  }
  .row-actions {
    display: flex;
    gap: 6px;
  }
  .secondary-button {
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
  .secondary-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
