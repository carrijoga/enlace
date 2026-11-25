<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import WorkspaceHeader from '../lib/account/WorkspaceHeader.svelte';
  import { readSession } from '../lib/account/client';
  import type { BuiltinGuestCategory } from '@enlace/contracts';
  import { GUEST_CATEGORIES } from '../lib/editor/guest-categories';

  let access = $state<'unknown' | 'guest' | 'member'>('unknown');

  onMount(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      const request = new AbortController();
      pending = request;
      try {
        const session = await readSession(request.signal);
        if (!request.signal.aborted) access = session ? 'member' : 'guest';
      } catch {
        if (!request.signal.aborted) access = 'unknown';
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') void refresh();
    }
    function onRestore(event: PageTransitionEvent) {
      if (event.persisted) void refresh();
    }
    function onStorage(event: StorageEvent) {
      if (event.key?.startsWith('enlace:account-logout:v1:')) void refresh();
    }
    void refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onRestore);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      pending?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onRestore);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  });

  // Ordem em que as primeiras pessoas chegam à planta ilustrativa.
  const arrivals = new Map<string, { category: BuiltinGuestCategory; order: number }>(
    (
      [
        ['L-0-0', 'familia'],
        ['R-0-0', 'familia'],
        ['L-1-0', 'padrinho'],
        ['R-1-1', 'madrinha'],
        ['L-2-1', 'convidado'],
        ['R-2-0', 'pajem'],
        ['L-3-2', 'convidado'],
        ['R-3-0', 'convidado'],
        ['L-4-0', 'familia'],
        ['R-4-3', 'convidado'],
      ] as const
    ).map(([seat, category], order) => [seat, { category, order }]),
  );

  const rows = [
    [3, 3],
    [4, 4],
    [6, 6],
    [7, 7],
    [7, 8],
  ].map(([left, right], row) => ({
    id: `preview-${row}`,
    left: Array.from({ length: left! }, (_, seat) => `L-${row}-${seat}`),
    right: Array.from({ length: right! }, (_, seat) => `R-${row}-${seat}`),
  }));
  const totalSeats = rows.reduce((total, row) => total + row.left.length + row.right.length, 0);
  const mapWidth = 620;
  const mapHeight = 380;
</script>

<svelte:head>
  <title>Enlace · Planeje sua cerimônia</title>
  <meta
    name="description"
    content="Organize a planta da cerimônia, distribua os lugares e prepare um mapa para o grande dia."
  />
</svelte:head>

<WorkspaceHeader
  current="inicio"
  accountLabel={access === 'member' ? 'Minha conta' : access === 'guest' ? 'Entrar' : 'Conta'}
/>

<main>
  <section class="workspace" aria-label="Planeje sua cerimônia">
    <div class="intro">
      <h1>Cada pessoa.<br />Um lugar especial.</h1>
      <p class="lead">
        Imagine o caminho até o altar, organize as fileiras e encontre um lugar para quem faz parte
        da sua história.
      </p>
      <div class="actions">
        <a class="button primary" href={resolve(access === 'member' ? '/projetos' : '/editor')}>
          {access === 'member'
            ? 'Abrir meus projetos'
            : access === 'guest'
              ? 'Planejar minha cerimônia'
              : 'Abrir editor local'}
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>
        </a>
        <a class="button secondary" href="#como-funciona">Como funciona</a>
      </div>
      <p class="small-note">
        {#if access === 'member'}
          Retome uma cerimônia salva ou crie um projeto na sua conta.
        {:else}
          O rascunho do editor local fica neste navegador e pode ser baixado em JSON.
        {/if}
      </p>
    </div>

    <div class="plan-panel">
      <div class="plan-heading">
        <h2>Uma ideia para a sua planta</h2>
        <p>5 fileiras <span aria-hidden="true">·</span> {totalSeats} cadeiras</p>
      </div>
      <div class="plan-canvas">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="img"
          aria-label={`Prévia ilustrativa com ${totalSeats} cadeiras em cinco fileiras e corredor central. Não representa medidas reais.`}
        >
          <path
            class="altar-trace"
            pathLength="1"
            d="M 310 25 Q 270 50 310 73 Q 350 50 310 25Z"
            fill="none"
            stroke="#a58557"
            stroke-width="2"
          />
          <path
            class="aisle-trace"
            d="M 310 48 V 345"
            stroke="#d6c8ad"
            stroke-width="1.5"
            stroke-dasharray="4 7"
          />
          {#snippet previewSeat(seat: string, x: number, y: number, delay: number)}
            {@const arrival = arrivals.get(seat)}
            {@const colors = arrival ? GUEST_CATEGORIES[arrival.category] : null}
            <g transform={`translate(${x}, ${y})`}>
              <g class="seat" style:--seat-delay={`${delay}ms`}>
                <rect
                  class:arrived={arrival}
                  style:--arrival-order={arrival?.order}
                  width="18"
                  height="22"
                  rx="4"
                  fill={colors?.fill ?? '#fffefb'}
                  stroke={colors?.stroke ?? '#b4bfb2'}
                />
                <path d="M 3 6 H 15" stroke={colors?.stroke ?? '#b4bfb2'} />
              </g>
            </g>
          {/snippet}
          {#each rows as row, ri (row.id)}
            <text
              x="17"
              y={119 + ri * 48}
              class="row-label row-number"
              style:--seat-delay={`${ri * 70}ms`}>{ri + 1}</text
            >
            {#each row.left as seat, si (seat)}
              {@render previewSeat(seat, 310 - 61 - si * 26, 103 + ri * 48, ri * 70 + si * 16)}
            {/each}
            {#each row.right as seat, si (seat)}
              {@render previewSeat(seat, 354 + si * 26, 103 + ri * 48, ri * 70 + si * 16)}
            {/each}
          {/each}
          <text x="310" y="365" text-anchor="middle" class="entrance-label">ENTRADA</text>
        </svg>
      </div>
      <div class="plan-caption">
        <span class="legend-dot" aria-hidden="true"></span><span>Prévia esquemática</span>
        <span class="orientation">Da entrada, olhando para o altar</span>
      </div>
    </div>
  </section>

  <section class="steps" id="como-funciona" aria-labelledby="steps-title">
    <div class="steps-intro">
      <h2 id="steps-title">Da primeira ideia ao grande dia.</h2>
      <p>Um espaço simples para visualizar a cerimônia e organizar quem estará ao seu lado.</p>
    </div>
    <ol>
      <li>
        <span class="step-number">01</span>
        <div>
          <h3>Desenhe o espaço</h3>
          <p>Configure o formato, as cadeiras e a largura do corredor.</p>
        </div>
      </li>
      <li>
        <span class="step-number">02</span>
        <div>
          <h3>Encontre cada lugar</h3>
          <p>Adicione seus convidados e posicione cada pessoa na planta.</p>
        </div>
      </li>
      <li>
        <span class="step-number">03</span>
        <div>
          <h3>Leve o plano com você</h3>
          <p>Baixe o mapa geral, os mapas individuais ou uma cópia JSON do projeto.</p>
        </div>
      </li>
    </ol>
  </section>
</main>

<footer class="site-footer">
  <span>enlace</span>
  <p>Planejar com clareza. Celebrar com presença.</p>
  <a href={resolve(access === 'member' ? '/projetos' : '/editor')}
    >{access === 'member' ? 'Meus projetos' : 'Abrir editor local'}
    <span class="arrow" aria-hidden="true">→</span></a
  >
</footer>

<style>
  .site-footer a {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    color: var(--green);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .site-footer a:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .button {
    text-decoration: none;
  }
  .button svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    transition: transform var(--dur-base) var(--ease-out);
  }
  .arrow {
    display: inline-block;
    margin-left: 4px;
    transition: transform var(--dur-base) var(--ease-out);
  }
  .seat rect:not(.arrived) {
    transition: fill var(--dur-fast) ease-out;
  }
  .seat:hover rect:not(.arrived) {
    fill: #eaf1e9;
  }
  /* A planta se arma e as primeiras pessoas chegam. Sem animação, o estado final já está no SVG. */
  @media (prefers-reduced-motion: no-preference) {
    .button:hover svg,
    .site-footer a:hover .arrow {
      transform: translateX(3px);
    }
    .altar-trace {
      stroke-dasharray: 1;
      animation: trace 760ms cubic-bezier(0.45, 0, 0.2, 1) backwards;
    }
    .aisle-trace {
      animation: walk-down 760ms var(--ease-out) 240ms backwards;
    }
    .seat {
      animation: seat-settle 420ms var(--ease-out) calc(420ms + var(--seat-delay)) backwards;
    }
    .row-number {
      animation: fade-in 420ms ease-out calc(420ms + var(--seat-delay)) backwards;
    }
    .arrived {
      animation: seat-taken 420ms ease-out calc(1240ms + var(--arrival-order) * 95ms) backwards;
    }
  }
  @keyframes trace {
    from {
      stroke-dashoffset: 1;
    }
  }
  @keyframes walk-down {
    from {
      clip-path: inset(0 0 100% 0);
    }
    to {
      clip-path: inset(0 0 0 0);
    }
  }
  @keyframes seat-settle {
    from {
      opacity: 0;
      transform: translateY(-7px);
    }
  }
  @keyframes seat-taken {
    from {
      fill: #fffefb;
      stroke: #b4bfb2;
    }
  }
  .steps {
    border-top: 1px solid var(--line);
    padding: 48px 0 62px;
    display: grid;
    grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
    gap: clamp(36px, 8vw, 120px);
  }
  .steps-intro h2 {
    margin: 0 0 14px;
    font:
      400 clamp(25px, 3vw, 34px)/1.2 Georgia,
      serif;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }
  .steps-intro p {
    max-width: 36ch;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.8;
  }
  .steps ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .steps li {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 14px;
    padding: 0 0 23px;
  }
  .steps li + li {
    border-top: 1px solid var(--line);
    padding-top: 21px;
  }
  .steps li:last-child {
    padding-bottom: 0;
  }
  .step-number {
    color: #7a6240;
    font:
      14px Georgia,
      serif;
    padding-top: 2px;
  }
  .steps h3 {
    margin: 0 0 5px;
    font-size: 14px;
    font-weight: 600;
  }
  .steps li p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.7;
  }
  .site-footer a {
    font-size: 11px;
  }
  @media (max-width: 680px) {
    .steps {
      grid-template-columns: 1fr;
      gap: 28px;
      padding: 35px 0 42px;
    }
    .steps-intro h2 {
      max-width: 18ch;
    }
    .steps li {
      grid-template-columns: 34px 1fr;
      gap: 10px;
    }
    .site-footer {
      align-items: baseline;
    }
    .site-footer p {
      order: 3;
      width: 100%;
      margin: 12px 0 0;
    }
  }
</style>
