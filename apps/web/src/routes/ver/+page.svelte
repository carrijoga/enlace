<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import type { SharedView } from '@enlace/contracts';
  import { getLayoutGeometry, getSeatLabels } from '@enlace/domain';
  import PlanCanvas from '../../lib/editor/PlanCanvas.svelte';
  import SeatList from '../../lib/editor/SeatList.svelte';
  import { GUEST_CATEGORIES, type GuestCategory } from '../../lib/editor/guest-categories';
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
  let zoom = $state(0);
  let selectedSeatId = $state<string | null>(null);
  let query = $state('');
  let planCanvas = $state<PlanCanvas>();

  const view = $derived(screen.kind === 'ready' ? screen.view : null);
  const project = $derived(view ? toViewProject(view) : null);
  const geometry = $derived(project ? getLayoutGeometry(project.layout) : null);
  const labels = $derived(project ? getSeatLabels(project.layout) : new Map<string, string>());
  const named = $derived(view?.mode === 'names');
  const total = $derived(geometry?.seats.length ?? 0);
  const occupied = $derived(project?.assignments.length ?? 0);
  const people = $derived(
    view?.mode === 'names'
      ? view.seats.map((seat) => ({ ...seat, key: normalizeName(seat.name) }))
      : [],
  );
  const matches = $derived.by(() => {
    const needle = normalizeName(query);
    if (!needle) return [];
    return people.filter((person) => person.key.includes(needle)).slice(0, 8);
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
    planCanvas?.reveal(seatId);
    planCanvas?.welcome(seatId);
  }

  onMount(() => {
    if (matchMedia('(max-width: 900px)').matches) zoom = 1;
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
    <a href={resolve('/')} class="brand" aria-label="Enlace, página inicial"
      ><svg viewBox="0 0 36 36" aria-hidden="true"
        ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
      ><span>enlace</span></a
    >
    <span class="readonly-badge">Somente visualização</span>
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
      <section class="intro">
        <h1 id="view-title">{project.title}</h1>
        {#if dateText}<p class="date">{dateText}</p>{/if}
        <p class="stats">
          <strong>{occupied}</strong> de <strong>{total}</strong> lugares ocupados
        </p>
      </section>

      {#if named}
        <section class="finder" aria-labelledby="finder-title">
          <h2 id="finder-title">Encontre seu lugar</h2>
          <label for="finder-input" class="sr-only">Digite seu nome</label>
          <input
            id="finder-input"
            type="search"
            autocomplete="off"
            placeholder="Digite seu nome"
            bind:value={query}
            aria-describedby="finder-result"
          />
          {#if query.trim()}
            {#if matches.length}
              <ul class="matches" aria-label="Pessoas encontradas">
                {#each matches as person (person.seatId)}
                  <li>
                    <button type="button" onclick={() => choose(person.seatId, true)}
                      ><span class="match-name">{person.name}</span><span class="match-seat"
                        >{labels.get(person.seatId)}</span
                      ></button
                    >
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="no-match">Nenhum nome encontrado. Confira a grafia ou procure na planta.</p>
            {/if}
          {/if}
        </section>
      {/if}

      <section class="plan" aria-label="Planta da cerimônia">
        <div class="plan-toolbar">
          <p class="selection" id="finder-result" role="status">
            {#if selected?.guest && named}
              <strong>{selected.guest.name}</strong> · {selected.label}
            {:else if selected}
              {selected.label}: {selected.guest ? 'ocupada' : 'disponível'}
            {:else}
              {named
                ? 'Toque numa cadeira para ver quem senta nela.'
                : 'Cadeiras ocupadas e livres.'}
            {/if}
          </p>
          <div class="zoom-tools">
            <button
              aria-label="Diminuir zoom"
              disabled={zoom > 0 && zoom <= 0.7}
              onclick={() => (zoom = Math.max(0.7, (zoom || 1) - 0.2))}
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg></button
            ><button onclick={() => (zoom = 0)} title="Enquadrar a planta inteira"
              >{zoom ? `${Math.round(zoom * 100)}%` : 'Ajustar'}</button
            ><button
              aria-label="Aumentar zoom"
              disabled={zoom >= 2}
              onclick={() => (zoom = Math.min(2, (zoom || 1) + 0.2))}
              ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4v12" /></svg
              ></button
            >
          </div>
        </div>
        <div class="canvas-frame">
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
        <div class="legend">
          {#if named}
            {#each ['familia', 'padrinho', 'pajem', 'convidado'] as category (category)}<span
                ><i
                  style:background={GUEST_CATEGORIES[category as GuestCategory].fill}
                  style:border-color={GUEST_CATEGORIES[category as GuestCategory].stroke}
                ></i>{category === 'padrinho'
                  ? 'Padrinhos'
                  : GUEST_CATEGORIES[category as GuestCategory].label}</span
              >{/each}
          {:else}
            <span><i class="occupied"></i>Ocupada</span><span><i></i>Disponível</span>
          {/if}
          <span class="orientation">Da entrada, olhando para o altar.</span>
        </div>
      </section>

      <SeatList
        {project}
        selectedGuestId={null}
        {selectedSeatId}
        readonly
        anonymous={!named}
        onSeatSelect={(id) => choose(id)}
      />
    </main>
  {/if}
</div>

<style>
  .view-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #f6f5f0;
  }
  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px clamp(16px, 4vw, 32px);
    border-bottom: 1px solid var(--line);
    background: var(--paper);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
  .readonly-badge {
    padding: 5px 10px;
    border: 1px solid #c4d0c0;
    border-radius: 999px;
    color: var(--green);
    font-size: 12px;
    font-weight: 600;
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
    gap: 16px;
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: clamp(16px, 3vw, 28px) clamp(12px, 3vw, 28px) 48px;
  }
  .intro h1 {
    margin: 0 0 4px;
    font:
      400 clamp(26px, 4vw, 34px) / 1.2 Georgia,
      serif;
    color: #27342c;
  }
  .date,
  .stats {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }
  .date {
    margin-bottom: 6px;
    color: #6b5530;
  }
  .stats strong {
    color: #27342c;
    font-variant-numeric: tabular-nums;
  }
  .finder {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
  }
  .finder h2 {
    margin: 0 0 10px;
    font:
      400 20px Georgia,
      serif;
  }
  .finder input {
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--field-line);
    border-radius: 8px;
    background: #fff;
    color: inherit;
    font-size: 16px;
  }
  .matches {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
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
    background: #fff;
    color: inherit;
    text-align: left;
  }
  .matches button:hover {
    background: #eaf1e9;
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
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
    overflow: hidden;
  }
  .plan-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #eef0e9;
  }
  .selection {
    margin: 0;
    min-height: 20px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
  }
  .selection strong {
    color: #27342c;
  }
  .zoom-tools {
    display: flex;
    flex-shrink: 0;
    border: 1px solid #dfe3da;
    border-radius: 8px;
  }
  .zoom-tools button {
    display: grid;
    place-items: center;
    min-width: 40px;
    min-height: 40px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #3e5f47;
    font-size: 12px;
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
    height: min(72dvh, 760px);
    min-height: 360px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 10px 14px;
    border-top: 1px solid #eef0e9;
    color: var(--muted);
    font-size: 12px;
  }
  .legend span {
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
    margin-left: auto;
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
  @media (max-width: 600px) {
    .plan-toolbar {
      flex-wrap: wrap;
    }
    .canvas-frame {
      height: 62dvh;
    }
    .orientation {
      margin-left: 0;
    }
  }
</style>
