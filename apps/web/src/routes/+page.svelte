<script lang="ts">
  import { resolve } from '$app/paths';

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

<header class="site-header">
  <a class="brand" href={resolve('/')} aria-label="Enlace, início">
    <svg viewBox="0 0 36 36" aria-hidden="true"
      ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
    >
    <span>enlace</span>
  </a>
  <a class="header-link" href={resolve('/editor')}
    >Abrir meu planejamento <span aria-hidden="true">→</span></a
  >
  <nav class="account-nav" aria-label="Acesso à conta">
    <a href={resolve('/conta')}>Entrar</a>
    <a href={resolve('/projetos')}>Meus projetos</a>
  </nav>
</header>

<main>
  <section class="workspace" aria-label="Planeje sua cerimônia">
    <div class="intro">
      <h1>Cada pessoa.<br />Um lugar especial.</h1>
      <p class="lead">
        Imagine o caminho até o altar, organize as fileiras e encontre um lugar para quem faz parte
        da sua história.
      </p>
      <div class="actions">
        <a class="button primary" href={resolve('/editor')}>
          Planejar minha cerimônia
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>
        </a>
        <a class="button secondary" href="#como-funciona">Como funciona</a>
      </div>
      <p class="small-note">
        Comece sem cadastro. O rascunho fica neste navegador e você pode baixar JSON.
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
            d="M 310 25 Q 270 50 310 73 Q 350 50 310 25Z"
            fill="none"
            stroke="#a58557"
            stroke-width="2"
          />
          <path d="M 310 48 V 345" stroke="#d6c8ad" stroke-width="1.5" stroke-dasharray="4 7" />
          {#each rows as row, ri (row.id)}
            <text x="17" y={119 + ri * 48} class="row-label">{ri + 1}</text>
            {#each row.left as seat, si (seat)}
              <g transform={`translate(${310 - 61 - si * 26}, ${103 + ri * 48})`}>
                <rect width="18" height="22" rx="4" fill="#fffefb" stroke="#b4bfb2" />
                <path d="M 3 6 H 15" stroke="#b4bfb2" />
              </g>
            {/each}
            {#each row.right as seat, si (seat)}
              <g transform={`translate(${354 + si * 26}, ${103 + ri * 48})`}>
                <rect width="18" height="22" rx="4" fill="#fffefb" stroke="#b4bfb2" />
                <path d="M 3 6 H 15" stroke="#b4bfb2" />
              </g>
            {/each}
          {/each}
          <text x="310" y="365" text-anchor="middle" class="entrance-label">ENTRADA</text>
        </svg>
      </div>
      <div class="plan-caption">
        <span class="legend-dot"></span><span>Prévia esquemática</span>
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
  <a href={resolve('/editor')}>Abrir meu planejamento <span aria-hidden="true">→</span></a>
</footer>

<style>
  .header-link,
  .site-footer a {
    color: var(--green);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .account-nav {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-left: 20px;
  }
  .account-nav a {
    color: #626e63;
    font-size: 13px;
    text-underline-offset: 4px;
  }
  .header-link:hover,
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
    color: #92774e;
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
    .site-header {
      flex-wrap: wrap;
      gap: 12px;
      padding-block: 16px;
    }
    .account-nav {
      margin-left: auto;
      gap: 10px;
    }
    .header-link {
      font-size: 11px;
    }
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
