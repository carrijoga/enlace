<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import type { SharedView } from '@enlace/contracts';
  import { getLayoutGeometry, getSeatLabels } from '@enlace/domain';
  import PlanCanvas from '../../lib/editor/PlanCanvas.svelte';
  import SeatList from '../../lib/editor/SeatList.svelte';
  import { GUEST_CATEGORIES, type GuestCategory } from '../../lib/editor/guest-categories';
  import { matchesSearch, toSearchWords } from '../../lib/search';
  import {
    fetchSharedView,
    normalizeName,
    ShareError,
    tokenFromHash,
    toViewProject,
  } from '../../lib/share/client';

  // Página pública do link de visualização (ADR-0014). Só lê: não carrega editor, histórico nem
  // salvamento, e nada daqui altera o projeto. O token vem do fragmento e vai só no corpo do POST.

  type State =
    | { kind: 'loading' }
    | { kind: 'ready'; view: SharedView }
    | { kind: 'error'; message: string; retry: boolean };

  let screen = $state<State>({ kind: 'loading' });
  let zoomPercent = $state(0);
  let selectedSeatId = $state<string | null>(null);
  let query = $state('');
  let planCanvas = $state<PlanCanvas>();
  let planTitle = $state<HTMLHeadingElement>();

  const view = $derived(screen.kind === 'ready' ? screen.view : null);
  const project = $derived(view ? toViewProject(view) : null);
  const geometry = $derived(project ? getLayoutGeometry(project.layout) : null);
  const labels = $derived(project ? getSeatLabels(project.layout) : new Map<string, string>());
  const named = $derived(view?.mode === 'names');
  const total = $derived(geometry?.seats.length ?? 0);
  const occupied = $derived(project?.assignments.length ?? 0);
  const zoom = $derived(zoomPercent / 100);
  const people = $derived(
    view?.mode === 'names'
      ? view.seats.map((seat) => ({ ...seat, words: toSearchWords(seat.name) }))
      : [],
  );
  const matches = $derived.by(() => {
    if (!normalizeName(query)) return [];
    return people.filter((person) => matchesSearch(person.words, query)).slice(0, 8);
  });
  const selected = $derived.by(() => {
    if (!selectedSeatId || !project) return null;
    const guest = project.guests.find((g) => g.id === selectedSeatId);
    return { label: labels.get(selectedSeatId) ?? '', guest };
  });
  const dateText = $derived.by(() => {
    if (!view?.weddingDate) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${view.weddingDate}T00:00:00Z`),
    );
  });

  // Cada carga recebe um número; só a mais recente pode trocar a tela, para que a resposta
  // atrasada de um link anterior não substitua o link colado depois na mesma aba.
  let generation = 0;

  async function load() {
    const current = ++generation;
    const token = tokenFromHash(location.hash);
    selectedSeatId = null;
    query = '';
    zoomPercent = 0;
    if (!token) {
      screen = {
        kind: 'error',
        message: 'Este link está incompleto. Peça um novo a quem enviou.',
        retry: false,
      };
      return;
    }
    screen = { kind: 'loading' };
    try {
      const view = await fetchSharedView(token);
      if (current !== generation) return;
      screen = { kind: 'ready', view };
    } catch (error) {
      if (current !== generation) return;
      const notFound = error instanceof ShareError && error.code === 'not_found';
      screen = {
        kind: 'error',
        message: notFound
          ? 'Este link não está mais disponível. Peça um novo a quem enviou.'
          : error instanceof Error
            ? error.message
            : 'Não foi possível abrir esta planta.',
        retry: !notFound,
      };
    }
  }

  async function choose(seatId: string, fromSearch = false) {
    selectedSeatId = seatId;
    if (fromSearch) query = '';
    await tick();
    if (fromSearch) {
      planTitle?.focus({ preventScroll: true });
      planTitle?.scrollIntoView({ block: 'start' });
    }
    planCanvas?.reveal(seatId);
    planCanvas?.welcome(seatId);
  }

  onMount(() => {
    void load();
    // Outro link colado na mesma aba troca só o fragmento, sem recarregar a página.
    const changed = () => void load();
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  });
</script>

<svelte:head>
  <title>{project ? `${project.title} · Enlace` : 'Planta compartilhada · Enlace'}</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="view-page">
  <header class="view-header">
    <div class="header-inner">
      <a href={resolve('/')} class="brand" aria-label="Enlace, página inicial">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <ellipse cx="14" cy="18" rx="8" ry="11" />
          <ellipse cx="23" cy="18" rx="8" ry="11" />
        </svg>
        <span>enlace</span>
      </a>
      <span class="view-mode">Somente visualização</span>
    </div>
  </header>

  {#if screen.kind === 'loading'}
    <main class="message-page" aria-busy="true">
      <p role="status">Abrindo a planta…</p>
    </main>
  {:else if screen.kind === 'error'}
    <main class="message-page">
      <h1>Não foi possível abrir</h1>
      <p role="alert">{screen.message}</p>
      {#if screen.retry}<button class="primary" onclick={load}>Tentar de novo</button>{/if}
    </main>
  {:else if project && geometry}
    <main class="view-main" aria-labelledby="view-title">
      <div class="view-sidebar">
        <div class="ceremony-info">
          <h1 id="view-title">{project.title}</h1>
          {#if dateText}<time class="date" datetime={view?.weddingDate ?? undefined}
              >{dateText}</time
            >{/if}
          <p class="stats">
            <strong>{occupied} de {total}</strong> lugares ocupados
          </p>
        </div>

        {#if named}
          <section class="finder" aria-labelledby="finder-title">
            <h2 id="finder-title">Encontre seu lugar</h2>
            <label for="finder-input" class="sr-only">Digite seu nome</label>
            <div class="search-field">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="4.5" />
                <path d="m12 12 4 4" />
              </svg>
              <input
                id="finder-input"
                type="search"
                autocomplete="off"
                placeholder="Digite seu nome"
                bind:value={query}
                aria-describedby="finder-result"
              />
            </div>
            {#if query.trim()}
              {#if matches.length}
                <ul class="matches" aria-label="Pessoas encontradas">
                  {#each matches as person (person.seatId)}
                    <li>
                      <button type="button" onclick={() => choose(person.seatId, true)}>
                        <span class="match-name">{person.name}</span>
                        <span class="match-seat">{labels.get(person.seatId)}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="no-match">
                  Nenhum nome encontrado. Confira a grafia ou procure na planta.
                </p>
              {/if}
            {/if}
          </section>
        {/if}

        <SeatList
          {project}
          selectedGuestId={null}
          {selectedSeatId}
          readonly
          anonymous={!named}
          onSeatSelect={(id) => choose(id)}
        />
      </div>

      <section class="plan" aria-labelledby="plan-title">
        <div class="plan-toolbar">
          <h2 id="plan-title" bind:this={planTitle} tabindex="-1">Planta</h2>
          <div class="zoom-tools">
            <button
              type="button"
              aria-label="Diminuir zoom"
              disabled={zoomPercent <= 70}
              onclick={() => (zoomPercent = Math.max(70, zoomPercent - 20))}
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg></button
            ><button
              type="button"
              onclick={() => (zoomPercent = 0)}
              aria-label={zoomPercent
                ? `${zoomPercent}% · Ajustar a planta à tela`
                : 'Ajustar a planta à tela'}
              title="Ajustar a planta à tela">{zoomPercent ? `${zoomPercent}%` : 'Ajustar'}</button
            ><button
              type="button"
              aria-label="Aumentar zoom"
              disabled={zoomPercent >= 200}
              onclick={() => (zoomPercent = Math.min(200, (zoomPercent || 100) + 20))}
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4v12" /></svg
              ></button
            >
          </div>
          <p class="selection" id="finder-result" role="status">
            {#if selected?.guest && named}
              <strong>{selected.guest.name}</strong> · {selected.label}
            {:else if selected}
              {selected.label}: {selected.guest ? 'ocupada' : 'disponível'}
            {:else}
              Selecione uma cadeira para ver os detalhes.
            {/if}
          </p>
        </div>
        <div class="canvas-frame" style:--map-ratio={geometry.height / geometry.width}>
          <PlanCanvas
            bind:this={planCanvas}
            {project}
            {geometry}
            selectedGuestId={null}
            {selectedSeatId}
            {zoom}
            readonly
            anonymous={!named}
            onSeatSelect={(id) => choose(id)}
          />
        </div>
        <div class="plan-footer">
          <ul class="legend" aria-label="Legenda da planta">
            {#if named}
              {#each ['familia', 'padrinho', 'pajem', 'convidado'] as category (category)}
                {@const colors = GUEST_CATEGORIES[category as GuestCategory]}
                <li>
                  <i style:background={colors.fill} style:border-color={colors.stroke}></i>
                  {category === 'padrinho' ? 'Padrinhos' : colors.label}
                </li>
              {/each}
            {:else}
              <li><i class="occupied"></i>Ocupada</li>
              <li><i></i>Disponível</li>
            {/if}
          </ul>
          <p class="orientation">Da entrada, olhando para o altar.</p>
        </div>
      </section>
    </main>
  {/if}
</div>

<style>
  .view-page {
    --view-gutter: clamp(12px, 2.2vw, 40px);
    --view-width: 1760px;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #f6f5f0;
  }
  .view-header {
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }
  .header-inner {
    max-width: var(--view-width);
    min-height: 56px;
    margin-inline: auto;
    padding-inline: var(--view-gutter);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    color: var(--green);
    text-decoration: none;
  }
  .brand svg {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: #b89364;
    stroke-width: 1.6;
  }
  .brand span {
    font:
      26px Georgia,
      serif;
    letter-spacing: -0.03em;
  }
  .view-mode {
    color: var(--muted);
    font-size: 12px;
  }
  .message-page {
    flex: 1;
    display: grid;
    place-content: center;
    gap: 12px;
    max-width: 460px;
    margin: 0 auto;
    padding: 40px 24px;
    text-align: center;
    color: var(--muted);
    line-height: 1.6;
  }
  .message-page h1 {
    margin: 0;
    color: #27342c;
    font:
      400 28px Georgia,
      serif;
  }
  .message-page p {
    margin: 0;
  }
  .primary {
    justify-self: center;
    min-height: 44px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: var(--green);
    color: #fff;
    font-weight: 600;
  }
  .view-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 16px;
    width: 100%;
    max-width: var(--view-width);
    padding: 16px var(--view-gutter) 24px;
  }
  .view-sidebar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .ceremony-info h1 {
    margin: 0 0 6px;
    font:
      400 clamp(27px, 4vw, 36px) / 1.12 Georgia,
      serif;
    letter-spacing: -0.025em;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .date,
  .stats {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }
  .date {
    display: block;
    margin-bottom: 4px;
    color: #6b5530;
  }
  .stats strong {
    color: #27342c;
    font-variant-numeric: tabular-nums;
  }
  .finder {
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .finder h2 {
    margin: 0 0 8px;
    font:
      400 20px / 1.25 Georgia,
      serif;
  }
  .search-field {
    position: relative;
  }
  .search-field svg {
    position: absolute;
    top: 50%;
    left: 12px;
    width: 20px;
    height: 20px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--green);
    stroke-width: 1.5;
    stroke-linecap: round;
    pointer-events: none;
  }
  .finder input {
    width: 100%;
    min-height: 46px;
    padding: 10px 12px 10px 40px;
    border: 1px solid var(--field-line);
    border-radius: 8px;
    background: var(--paper);
    color: inherit;
    font-size: 16px;
  }
  .finder input::placeholder {
    color: var(--muted);
    opacity: 1;
  }
  .matches {
    max-height: min(288px, 34svh);
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: auto;
  }
  .matches li + li {
    border-top: 1px solid var(--line);
  }
  .matches button {
    display: grid;
    width: 100%;
    min-height: 48px;
    padding: 8px 12px;
    border: 0;
    background: var(--paper);
    color: inherit;
    text-align: left;
  }
  .matches button:hover {
    background: #eaf1e9;
  }
  .matches button:focus-visible {
    outline-offset: -3px;
  }
  .match-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .match-seat {
    color: var(--muted);
    font-size: 12px;
  }
  .no-match {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
  .plan {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
  }
  .plan-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 12px;
    padding: 8px 12px 12px;
    border-bottom: 1px solid var(--line);
  }
  .plan-toolbar h2 {
    margin: 0;
    scroll-margin-top: 20px;
    font:
      400 23px / 1.15 Georgia,
      serif;
  }
  .selection {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .selection strong {
    color: #27342c;
  }
  .zoom-tools {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #f6f5f0;
  }
  .zoom-tools button {
    display: grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--green);
    font-size: 12px;
  }
  .zoom-tools button:nth-child(2) {
    min-width: 56px;
  }
  .zoom-tools button:hover:not(:disabled) {
    background: #e8f0e7;
  }
  .zoom-tools button:disabled {
    cursor: default;
  }
  .zoom-tools svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .canvas-frame {
    display: flex;
    min-width: 0;
    height: clamp(280px, calc((100vw - 2 * var(--view-gutter)) * var(--map-ratio)), 58svh);
  }
  .canvas-frame :global(.map-viewport) {
    min-width: 0;
    overscroll-behavior-y: auto;
  }
  .plan-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .legend i {
    width: 14px;
    height: 14px;
    border: 1px solid #b7c4b3;
    border-radius: 4px;
    background: #fffefb;
  }
  .legend i.occupied {
    border-color: #5f825f;
    background: #e3ebe1;
  }
  .orientation {
    margin: 0;
  }
  :focus-visible {
    outline: 3px solid #5f825f;
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (min-width: 62rem) {
    .view-main {
      grid-template-columns: minmax(0, clamp(240px, 24vw, 340px)) minmax(0, 1fr);
      gap: clamp(24px, 2.6vw, 44px);
      padding-block: 24px;
    }
    .view-sidebar {
      gap: 20px;
      padding-top: 8px;
    }
    .finder {
      padding-top: 20px;
    }
    .plan-toolbar {
      gap: 4px 16px;
      padding: 12px 16px;
    }
    .zoom-tools {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .selection {
      grid-column: 1;
    }
    .canvas-frame {
      height: max(360px, calc(100svh - 224px));
    }
    .plan-footer {
      padding-inline: 16px;
    }
  }
</style>
