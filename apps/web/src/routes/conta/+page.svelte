<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    authError,
    authRequest,
    readSession,
    type AccountSession,
  } from '../../lib/account/client';
  import { clearAccountDraft } from '../../lib/editor/files/drafts';

  let session = $state<AccountSession | null>(null);
  let mode = $state<'login' | 'signup' | 'recover' | 'reset'>('login');
  let email = $state('');
  let name = $state('');
  let password = $state('');
  let token = $state('');
  let loading = $state(false);
  let checking = $state(true);
  let message = $state('');
  let error = $state(false);
  let resetAvailable = $state(false);
  let nextPath = $state('/projetos');
  let deletePassword = $state('');
  let deleteConfirmation = $state('');

  onMount(() => {
    const url = new URL(window.location.href);
    const requestedNext = url.searchParams.get('next');
    if (requestedNext) {
      const destination = new URL(requestedNext, window.location.origin);
      if (destination.origin === window.location.origin)
        nextPath = `${destination.pathname}${destination.search}${destination.hash}`;
    }
    token = url.searchParams.get('token') ?? '';
    if (token) mode = 'reset';
    void Promise.all([
      readSession()
        .then((value) => (session = value))
        .catch(() => (message = 'Não foi possível consultar sua sessão.')),
      fetch('/api/auth-capabilities')
        .then((response) => (response.ok ? response.json() : null))
        .then((value) => (resetAvailable = value?.passwordReset === true))
        .catch(() => (resetAvailable = false)),
    ]).finally(() => (checking = false));
  });

  // Os botões de troca de modo são removidos da página; leva o foco ao primeiro campo do novo modo.
  async function changeMode(next: typeof mode) {
    mode = next;
    message = '';
    error = false;
    await tick();
    document
      .getElementById(next === 'signup' ? 'name' : next === 'reset' ? 'password' : 'email')
      ?.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    message = '';
    error = false;
    try {
      if (mode === 'recover') {
        if (!resetAvailable)
          throw new Error(
            'A recuperação por e-mail ainda não está configurada. Fale com o suporte para recuperar o acesso.',
          );
        await authRequest('request-password-reset', {
          email,
          redirectTo: `${window.location.origin}${resolve('/conta')}`,
        });
        message = 'Se houver uma conta para esse e-mail, enviaremos instruções de recuperação.';
      } else if (mode === 'reset') {
        if (!token)
          throw new Error('O link de recuperação está incompleto. Solicite um novo e-mail.');
        await authRequest('reset-password', { token, newPassword: password });
        mode = 'login';
        password = '';
        message = 'Senha atualizada. Entre com sua nova senha.';
      } else {
        await authRequest(
          mode === 'signup' ? 'sign-up/email' : 'sign-in/email',
          mode === 'signup' ? { name, email, password } : { email, password },
        );
        session = await readSession();
        if (session) {
          window.location.assign(nextPath);
          return;
        }
        message = 'A conta foi criada. Confirme o acesso para continuar.';
      }
    } catch (cause) {
      message = authError(cause);
      error = true;
    } finally {
      loading = false;
    }
  }

  async function logout() {
    loading = true;
    try {
      await authRequest('sign-out', {});
      if (session) clearAccountDraft(window.localStorage, session.user.id);
      session = null;
      message = 'Você saiu da sua conta.';
      window.location.assign(resolve('/editor'));
    } catch (cause) {
      message = authError(cause);
      error = true;
    } finally {
      loading = false;
    }
  }

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault();
    if (!session || deleteConfirmation.trim() !== session.user.email) return;
    loading = true;
    message = '';
    error = false;
    try {
      await authRequest('delete-user', { password: deletePassword });
      const deletedUserId = session.user.id;
      session = null;
      try {
        clearAccountDraft(window.localStorage, deletedUserId);
      } catch {
        message =
          'Sua conta foi excluída, mas não foi possível remover os rascunhos deste navegador. Remova os dados do site manualmente.';
        return;
      }
      window.location.assign(resolve('/editor'));
    } catch (cause) {
      message = authError(cause);
      error = true;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head
  ><title>Conta · Enlace</title><meta
    name="description"
    content="Acesse seus projetos de cerimônia no Enlace."
  /></svelte:head
>

<header class="site-header">
  <a class="brand" href={resolve('/')} aria-label="Enlace, início"
    ><svg viewBox="0 0 36 36" aria-hidden="true"
      ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
    ><span>enlace</span></a
  >
  <nav aria-label="Principal">
    <a class="header-link" href={resolve('/projetos')}
      >Meus projetos <span aria-hidden="true">→</span></a
    >
  </nav>
</header>

<main class="account-page">
  <section class="account-intro">
    <h1>Seu planejamento, de onde estiver.</h1>
    <p>
      Entre para abrir seus projetos em outros dispositivos. Você também pode continuar sem conta no
      editor local.
    </p>
    <a class="local-link" href={resolve('/editor')}
      >Continuar sem entrar <span aria-hidden="true">→</span></a
    >
  </section>

  <section class="account-form" aria-labelledby="account-title">
    {#if checking}<p role="status">Verificando sua sessão…</p>
    {:else if session}
      <h2 id="account-title">Olá, {session.user.name || session.user.email}</h2>
      <p class="account-email">{session.user.email}</p>
      <a class="button primary" href={resolve('/projetos')}>Abrir meus projetos</a>
      <button class="button secondary" disabled={loading} onclick={logout}>Sair da conta</button>
      <p class="local-draft-note">
        Ao sair, os rascunhos desta conta são removidos deste navegador. Exporte alterações ainda
        não salvas antes de sair.
      </p>
      <section class="danger-zone" aria-labelledby="delete-title">
        <h3 id="delete-title">Excluir conta</h3>
        <p>Esta ação é permanente. Seus projetos, convidados, lugares e sessões serão apagados.</p>
        <form onsubmit={deleteAccount}>
          <label for="delete-password">Confirme sua senha</label>
          <input
            id="delete-password"
            type="password"
            bind:value={deletePassword}
            autocomplete="current-password"
            aria-describedby={message ? 'delete-message' : undefined}
            required
            minlength="12"
            maxlength="128"
          />
          <label for="delete-confirmation">Digite {session.user.email} para confirmar</label>
          <input
            id="delete-confirmation"
            type="email"
            bind:value={deleteConfirmation}
            autocomplete="off"
            required
            maxlength="254"
          />
          <div id="delete-message" role={error ? 'alert' : 'status'}>
            {#if message}<p class:message-error={error} class="message">{message}</p>{/if}
          </div>
          <button
            class="button destructive"
            disabled={loading || deleteConfirmation.trim() !== session.user.email}
          >
            {loading ? 'Aguarde…' : 'Excluir minha conta permanentemente'}
          </button>
        </form>
      </section>
    {:else}
      <h2 id="account-title">
        {mode === 'signup'
          ? 'Criar conta'
          : mode === 'recover'
            ? 'Recuperar acesso'
            : mode === 'reset'
              ? 'Criar nova senha'
              : 'Bem-vinda(o) de volta'}
      </h2>
      <p>
        {mode === 'signup'
          ? 'Guarde seus projetos e retome em outro dispositivo.'
          : mode === 'recover'
            ? 'Informe o e-mail usado na conta.'
            : mode === 'reset'
              ? 'Escolha uma senha nova para sua conta.'
              : 'Entre para continuar de onde parou.'}
      </p>
      <form onsubmit={submit}>
        {#if mode === 'signup'}<label for="name">Seu nome</label><input
            id="name"
            bind:value={name}
            autocomplete="name"
            required
            maxlength="100"
          />{/if}
        {#if mode !== 'reset'}<label for="email">E-mail</label><input
            id="email"
            type="email"
            bind:value={email}
            autocomplete="email"
            aria-describedby={message ? 'account-message' : undefined}
            required
            maxlength="254"
          />{/if}
        {#if mode !== 'recover'}<label for="password"
            >{mode === 'reset' ? 'Nova senha' : 'Senha'}</label
          ><input
            id="password"
            type="password"
            bind:value={password}
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-describedby={message ? 'account-message' : undefined}
            required
            minlength={mode === 'login' ? 8 : 12}
            maxlength="128"
          />{/if}
        <div id="account-message" role={error ? 'alert' : 'status'}>
          {#if message}<p class:message-error={error} class="message">{message}</p>{/if}
        </div>
        <button class="button primary submit" disabled={loading}
          >{loading
            ? 'Aguarde…'
            : mode === 'signup'
              ? 'Criar minha conta'
              : mode === 'recover'
                ? 'Enviar instruções'
                : mode === 'reset'
                  ? 'Salvar nova senha'
                  : 'Entrar'}</button
        >
      </form>
      <nav class="form-links" aria-label="Opções de conta">
        {#if mode === 'login'}<button type="button" onclick={() => changeMode('signup')}
            >Criar conta</button
          >{#if resetAvailable}<button type="button" onclick={() => changeMode('recover')}
              >Esqueci minha senha</button
            >{/if}
        {:else}<button type="button" onclick={() => changeMode('login')}>Voltar para entrar</button
          >{/if}
      </nav>
    {/if}
  </section>
</main>

<style>
  .account-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: clamp(48px, 8vw, 100px) clamp(24px, 7vw, 96px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
    align-items: center;
    gap: clamp(40px, 8vw, 110px);
  }
  .account-intro h1 {
    max-width: 11ch;
    margin: 0 0 20px;
    font:
      400 clamp(38px, 5vw, 58px)/1.12 Georgia,
      serif;
    letter-spacing: -0.035em;
    color: #27342c;
  }
  .account-intro p {
    max-width: 52ch;
    color: #626e63;
    line-height: 1.8;
  }
  .local-link,
  .header-link {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    color: #295842;
    font-weight: 650;
    text-underline-offset: 4px;
  }
  .account-form {
    padding: clamp(25px, 4vw, 38px);
    background: #fffefb;
    border: 1px solid #dfe3da;
    border-radius: 14px;
  }
  .account-form h2 {
    margin: 0 0 8px;
    font:
      400 27px/1.2 Georgia,
      serif;
  }
  .account-form > p {
    margin: 0 0 22px;
    color: #626e63;
    line-height: 1.65;
  }
  .account-email {
    overflow-wrap: anywhere;
  }
  .local-draft-note {
    margin: 8px 0 0;
    color: #626e63;
    font-size: 13px;
    line-height: 1.55;
  }
  form {
    display: grid;
    gap: 9px;
  }
  label {
    margin-top: 7px;
    font-size: 13px;
    font-weight: 650;
  }
  input {
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    color: #27342c;
    background: #fffefb;
    border: 1px solid var(--field-line);
    border-radius: 8px;
  }
  .button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 46px;
    padding: 11px 16px;
    border: 1px solid #295842;
    border-radius: 9px;
    font: inherit;
    font-weight: 650;
    text-decoration: none;
  }
  .primary {
    color: #fffefb;
    background: #295842;
  }
  .secondary {
    margin-top: 10px;
    color: #295842;
    background: transparent;
  }
  .danger-zone {
    margin-top: 28px;
    padding-top: 22px;
    border-top: 1px solid #e5c9c3;
  }
  .danger-zone h3 {
    margin: 0 0 8px;
    color: #873d35;
    font:
      600 18px/1.3 Georgia,
      serif;
  }
  .danger-zone > p {
    color: #6f514c;
    font-size: 14px;
    line-height: 1.6;
  }
  .destructive {
    color: #fff;
    background: #873d35;
    border-color: #873d35;
  }
  .submit {
    margin-top: 10px;
  }
  .form-links {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
    margin-top: 18px;
  }
  .form-links button {
    min-height: 32px;
    padding: 0;
    color: #295842;
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .message {
    margin: 5px 0;
    color: #295842 !important;
    font-size: 14px;
  }
  .message-error {
    color: #923d35 !important;
  }
  /* O erro não depende só da cor. */
  .message-error::before {
    content: 'Erro: ';
    font-weight: 700;
  }
  @media (max-width: 720px) {
    .account-page {
      grid-template-columns: 1fr;
      gap: 34px;
      padding-block: 42px 60px;
    }
    .account-intro h1 {
      max-width: 14ch;
    }
  }
</style>
