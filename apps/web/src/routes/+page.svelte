<script lang="ts">
  import { resolve } from '$app/paths';
  import type { CeremonyProject } from '@enlace/contracts';

  let project = $state<CeremonyProject | null>(null);
  let busy = $state(false);
  let message = $state('');
  let messageIsError = $state(false);
  let connection = $state<'idle' | 'checking' | 'ok' | 'error'>('idle');
  let fileInput: HTMLInputElement;
  const initialRows = [
    [3, 3],
    [4, 4],
    [6, 6],
    [7, 7],
    [7, 8],
  ].map(([left, right], row) => ({
    id: `preview-${row}`,
    leftSeatIds: Array.from({ length: left }, (_, seat) => `L-${row}-${seat}`),
    rightSeatIds: Array.from({ length: right }, (_, seat) => `R-${row}-${seat}`),
  }));
  const rows = $derived(project?.layout.rows ?? initialRows);
  const totalSeats = $derived(
    rows.reduce((total, row) => total + row.leftSeatIds.length + row.rightSeatIds.length, 0),
  );
  const occupied = $derived(
    new Set(project?.assignments.map((assignment) => assignment.seatId) ?? []),
  );
  const mapWidth = $derived(
    Math.max(
      620,
      ...rows.map((row) => Math.max(row.leftSeatIds.length, row.rightSeatIds.length) * 52 + 200),
    ),
  );
  const mapHeight = $derived(rows.length * 45 + 155);

  async function useExample() {
    busy = true;
    try {
      const { createDemoDocument } = await import('@enlace/contracts');
      project = createDemoDocument().project;
      message = 'Exemplo aberto. Você pode baixar uma cópia em JSON.';
      messageIsError = false;
    } finally {
      busy = false;
    }
  }

  async function openFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    busy = true;
    try {
      const { MAX_PROJECT_FILE_BYTES, parseProjectFile } = await import('@enlace/contracts');
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('O arquivo deve ter até 2 MiB.');
      const document = parseProjectFile(await file.text());
      project = document.project;
      message = 'Projeto aberto para conferência. Nenhuma alteração foi feita no arquivo original.';
      messageIsError = false;
    } catch (error) {
      message =
        error instanceof Error && !('issues' in error)
          ? error.message
          : 'O arquivo contém dados inválidos. Confira a versão, os nomes e os lugares e tente novamente.';
      messageIsError = true;
    } finally {
      busy = false;
      input.value = '';
    }
  }

  async function downloadProject() {
    if (!project) return;
    const { projectDocumentSchema } = await import('@enlace/contracts');
    const document = projectDocumentSchema.parse({
      format: 'enlace-project',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
    );
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'enlace-projeto.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function checkConnection() {
    connection = 'checking';
    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error('Serviço indisponível');
      const { healthResponseSchema } = await import('@enlace/contracts');
      healthResponseSchema.parse(await response.json());
      connection = 'ok';
    } catch {
      connection = 'error';
    }
  }
</script>

<svelte:head>
  <title>Enlace · Cada pessoa no seu lugar</title>
  <meta
    name="description"
    content="Um espaço para imaginar e organizar os lugares da sua cerimônia de casamento."
  />
</svelte:head>

<header class="site-header">
  <a class="brand" href={resolve('/')} aria-label="Enlace, início">
    <svg viewBox="0 0 36 36" aria-hidden="true"
      ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
    >
    <span>enlace</span>
  </a>
  <span class="header-description">O começo da sua cerimônia.</span>
</header>

<main>
  <section class="workspace" aria-label="Seu planejamento">
    <div class="intro">
      <h1>Cada pessoa.<br />Um lugar especial.</h1>
      <p class="lead">
        Imagine o caminho até o altar, organize as fileiras e encontre um lugar para quem faz parte
        da sua história.
      </p>
      <div class="actions">
        <button class="button primary" onclick={useExample} disabled={busy}
          >Explorar exemplo <span aria-hidden="true">→</span></button
        >
        <button class="button secondary" onclick={() => fileInput.click()} disabled={busy}
          >Abrir arquivo JSON</button
        >
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,application/json"
          onchange={openFile}
          aria-label="Abrir projeto JSON"
          hidden
        />
      </div>
      <p class="small-note">
        Esta é a primeira base do Enlace. Por enquanto, você pode conferir um projeto ou explorar um
        exemplo com dados fictícios.
      </p>
      <div class:has-error={messageIsError} class="feedback" role="status" aria-live="polite">
        {busy ? 'Preparando seu projeto…' : message}
      </div>
      {#if project}
        <div class="project-summary">
          <h2>{project.title}</h2>
          <dl>
            <div>
              <dt>Convidados</dt>
              <dd>{project.guests.length}</dd>
            </div>
            <div>
              <dt>Lugares definidos</dt>
              <dd>{project.assignments.length}</dd>
            </div>
            <div>
              <dt>Formato</dt>
              <dd>{project.layout.mode === 'curve' ? 'Meia-lua' : 'Tradicional'}</dd>
            </div>
          </dl>
          <button class="text-button" onclick={downloadProject}
            >Baixar projeto em JSON <span aria-hidden="true">↓</span></button
          >
          <p class="small-note">
            Aberto somente nesta sessão. Contas e salvamento na nuvem serão adicionados depois.
          </p>
        </div>
      {/if}
    </div>

    <div class="plan-panel">
      <div class="plan-heading">
        <h2>{project ? 'Estrutura do projeto' : 'Um espaço para o seu sim'}</h2>
        <p>{rows.length} fileiras <span aria-hidden="true">·</span> {totalSeats} cadeiras</p>
      </div>
      <div class="plan-canvas">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="img"
          aria-label={`Esquema de quantidades por fileira, com ${totalSeats} cadeiras e corredor central. Não representa medidas reais.`}
        >
          <rect x={mapWidth / 2 - 51} y="28" width="102" height="39" rx="12" fill="#eaf1e9" />
          <text x={mapWidth / 2} y="53" text-anchor="middle" class="altar-label">ALTAR</text>
          <path
            d={`M ${mapWidth / 2} 92 V ${mapHeight - 52}`}
            stroke="#d6c8ad"
            stroke-width="1.5"
            stroke-dasharray="4 7"
          />
          {#each rows as row, ri (row.id)}
            <text x="17" y={126 + ri * 45} class="row-label">{ri + 1}</text>
            {#each row.leftSeatIds as seat, si (seat)}
              <g transform={`translate(${mapWidth / 2 - 72 - si * 26}, ${110 + ri * 45})`}>
                <rect
                  width="18"
                  height="22"
                  rx="4"
                  fill={occupied.has(seat) ? '#bad4be' : '#fffefb'}
                  stroke={occupied.has(seat) ? '#72977d' : '#b4bfb2'}
                />
                <path d="M 3 6 H 15" stroke={occupied.has(seat) ? '#72977d' : '#b4bfb2'} />
              </g>
            {/each}
            {#each row.rightSeatIds as seat, si (seat)}
              <g transform={`translate(${mapWidth / 2 + 54 + si * 26}, ${110 + ri * 45})`}>
                <rect
                  width="18"
                  height="22"
                  rx="4"
                  fill={occupied.has(seat) ? '#bad4be' : '#fffefb'}
                  stroke={occupied.has(seat) ? '#72977d' : '#b4bfb2'}
                />
                <path d="M 3 6 H 15" stroke={occupied.has(seat) ? '#72977d' : '#b4bfb2'} />
              </g>
            {/each}
          {/each}
          <text x={mapWidth / 2} y={mapHeight - 21} text-anchor="middle" class="entrance-label"
            >ENTRADA</text
          >
        </svg>
      </div>
      <div class="plan-caption">
        <span class="legend-dot"></span><span>Prévia esquemática por fileira</span><span
          class="orientation">Da entrada, olhando para o altar</span
        >
      </div>
    </div>
  </section>

  <section class="next-step" aria-label="Estado da versão">
    <div>
      <h2>Uma base para construir com cuidado.</h2>
      <p>
        O próximo passo é trazer a edição da planta. Depois, seus projetos poderão acompanhar você
        em qualquer dispositivo.
      </p>
    </div>
    <details class="connection-panel">
      <summary>Conexão com o serviço</summary>
      <p role="status" aria-live="polite">
        {connection === 'ok'
          ? 'Serviço conectado. O banco e as contas ainda não fazem parte deste fluxo.'
          : connection === 'error'
            ? 'Não foi possível conectar. Confira se o serviço está em execução e tente novamente.'
            : connection === 'checking'
              ? 'Verificando conexão…'
              : 'Você pode conferir a conexão sem enviar dados do seu projeto.'}
      </p>
      <button class="text-button" disabled={connection === 'checking'} onclick={checkConnection}
        >Verificar conexão</button
      >
    </details>
  </section>
</main>

<footer class="site-footer">
  <span>enlace</span>
  <p>Planejar com clareza. Celebrar com presença.</p>
  <span>Versão inicial</span>
</footer>
