<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import type { RedeemShareLinkRequest } from '@enlace/contracts';
  import { readSession, type AccountSession } from '../../lib/account/client';
  import { participationFromHash, redeemShareLink, ShareError } from '../../lib/share/client';

  // Página de participação por link compartilhado (#edit.<token> ou #clone.<token>).
  // O fragmento nunca é enviado na navegação; o resgate exige clique explícito da pessoa destinatária.

  let checking = $state(true);
  let redeeming = $state(false);
  let participation = $state<RedeemShareLinkRequest | null>(null);
  let session = $state<AccountSession | null>(null);
  let errorMessage = $state('');
  let generation = 0;

  const badgeText = $derived(
    participation?.mode === 'edit'
      ? 'Convite de edição'
      : participation?.mode === 'clone'
        ? 'Cópia de projeto'
        : 'Compartilhamento',
  );

  const pageTitle = $derived(
    participation?.mode === 'edit'
      ? 'Editar projeto compartilhado · Enlace'
      : participation?.mode === 'clone'
        ? 'Copiar projeto · Enlace'
        : 'Compartilhamento · Enlace',
  );

  async function load() {
    const current = ++generation;
    errorMessage = '';
    redeeming = false;
    const parsed = participationFromHash(location.hash);
    participation = parsed;
    if (!parsed) {
      checking = false;
      return;
    }
    checking = true;
    try {
      const activeSession = await readSession();
      if (current !== generation) return;
      session = activeSession;
    } catch (error) {
      if (current !== generation) return;
      session = null;
      errorMessage =
        error instanceof Error ? error.message : 'Não foi possível consultar sua conta.';
    } finally {
      if (current === generation) checking = false;
    }
  }

  async function confirmParticipation() {
    if (!participation || redeeming) return;
    redeeming = true;
    errorMessage = '';
    try {
      const projectId = await redeemShareLink(participation);
      window.location.assign(`${resolve('/editor')}?project=${encodeURIComponent(projectId)}`);
    } catch (error) {
      if (error instanceof ShareError && error.code === 'unauthenticated') {
        session = null;
        errorMessage = error.message;
      } else {
        errorMessage =
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir o projeto. Tente de novo.';
      }
    } finally {
      redeeming = false;
    }
  }

  onMount(() => {
    void load();
    const changed = () => void load();
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="participate-page">
  <header class="participate-header">
    <a href={resolve('/')} class="brand" aria-label="Enlace, página inicial"
      ><svg viewBox="0 0 36 36" aria-hidden="true"
        ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
      ><span>enlace</span></a
    >
    <span class="mode-badge">{badgeText}</span>
  </header>

  {#if checking}
    <main class="card-container" aria-busy="true">
      <section class="card">
        <p role="status">Verificando sua conta…</p>
      </section>
    </main>
  {:else if !participation}
    <main class="card-container">
      <section class="card">
        <h1>Não foi possível abrir</h1>
        <p role="alert" class="alert-box">Este link está incompleto. Peça um novo a quem enviou.</p>
        <div class="actions">
          <a class="button primary" href={resolve('/')}>Voltar ao início</a>
          <a class="secondary-link" href={resolve('/projetos')}>Ir para meus projetos</a>
        </div>
      </section>
    </main>
  {:else if !session}
    <main class="card-container" aria-labelledby="participate-title">
      <section class="card">
        {#if participation.mode === 'edit'}
          <h1 id="participate-title">Editar projeto compartilhado</h1>
          <p>
            Quem enviou este link convidou você para editar a planta, os convidados e as observações
            do projeto original.
          </p>
          <p>Para continuar e abrir o projeto no editor, entre ou crie uma conta no Enlace.</p>
        {:else}
          <h1 id="participate-title">Copiar projeto para sua conta</h1>
          <p>
            Este link cria uma cópia independente da última versão salva do projeto diretamente na
            sua conta do Enlace.
          </p>
          <p>Para continuar e receber sua cópia, entre ou crie uma conta no Enlace.</p>
        {/if}

        {#if errorMessage}
          <p role="alert" class="alert-box">{errorMessage}</p>
        {/if}

        <div class="actions">
          <a
            class="button primary"
            href={resolve(
              `/conta?next=${encodeURIComponent(resolve('/participar'))}#${participation.mode}.${participation.token}`,
            )}>Entrar ou criar conta</a
          >
          <a class="secondary-link" href={resolve('/')}>Voltar ao início</a>
        </div>
      </section>
    </main>
  {:else}
    <main class="card-container" aria-labelledby="participate-title">
      <section class="card">
        <p class="account-status">
          Você está conectado(a) como <strong>{session.user.email}</strong>.
          <a href={resolve('/conta')}>Trocar conta</a>
        </p>

        {#if participation.mode === 'edit'}
          <h1 id="participate-title">Editar projeto compartilhado</h1>
          <p>
            Ao confirmar, o projeto original será aberto no seu editor e aparecerá em "Meus
            projetos" enquanto este link estiver ativo. Alterações feitas por você são salvas
            diretamente no projeto original.
          </p>
        {:else}
          <h1 id="participate-title">Criar cópia na sua conta</h1>
          <p>
            Ao confirmar, uma cópia independente da última versão salva será criada na sua conta.
            Suas alterações não mudam o projeto original, e a cópia continua sua mesmo se o link
            vencer ou for desativado.
          </p>
        {/if}

        {#if errorMessage}
          <p role="alert" class="alert-box">{errorMessage}</p>
        {/if}

        <div class="actions">
          <button
            type="button"
            class="button primary"
            disabled={redeeming}
            onclick={confirmParticipation}
          >
            {#if participation.mode === 'edit'}
              {redeeming ? 'Abrindo projeto…' : 'Abrir projeto para editar'}
            {:else}
              {redeeming ? 'Criando cópia…' : 'Criar cópia e abrir'}
            {/if}
          </button>
          <a class="secondary-link" href={resolve('/projetos')}>Ir para meus projetos</a>
        </div>
      </section>
    </main>
  {/if}
</div>

<style>
  .participate-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #f6f5f0;
    color: #27342c;
  }
  .participate-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px clamp(16px, 4vw, 32px);
    border-bottom: 1px solid #dfe3da;
    background: #fffefb;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #295842;
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
  .mode-badge {
    padding: 5px 10px;
    border: 1px solid #c4d0c0;
    border-radius: 999px;
    color: #295842;
    font-size: 12px;
    font-weight: 600;
  }
  .card-container {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 32px 20px;
  }
  .card {
    width: min(500px, 100%);
    padding: clamp(24px, 4vw, 36px);
    border: 1px solid #dfe3da;
    border-radius: 14px;
    background: #fffefb;
    display: grid;
    gap: 14px;
    line-height: 1.65;
  }
  .card h1 {
    margin: 0;
    color: #27342c;
    font:
      400 clamp(26px, 4vw, 32px) / 1.2 Georgia,
      serif;
  }
  .card p {
    margin: 0;
    color: #536354;
  }
  .account-status {
    font-size: 13px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eef0e9;
    overflow-wrap: anywhere;
  }
  .account-status strong {
    color: #27342c;
  }
  .account-status a {
    margin-left: 6px;
    color: #295842;
    font-weight: 600;
    text-underline-offset: 3px;
  }
  .alert-box {
    padding: 10px 12px;
    border: 1px solid #e5c9c3;
    border-radius: 8px;
    background: #fdf6f5;
    color: #873d35 !important;
    font-size: 14px;
  }
  .actions {
    display: grid;
    gap: 12px;
    margin-top: 6px;
  }
  .button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 46px;
    padding: 11px 18px;
    border: 1px solid #295842;
    border-radius: 9px;
    font: inherit;
    font-weight: 650;
    text-decoration: none;
    cursor: pointer;
  }
  .primary {
    background: #295842;
    color: #fffefb;
  }
  .primary:hover:not(:disabled) {
    background: #1e4433;
  }
  .primary:disabled {
    opacity: 0.7;
    cursor: wait;
  }
  .secondary-link {
    justify-self: center;
    color: #295842;
    font-size: 14px;
    font-weight: 600;
    text-underline-offset: 4px;
  }
  :focus-visible {
    outline: 3px solid #5f825f;
    outline-offset: 2px;
  }
</style>
