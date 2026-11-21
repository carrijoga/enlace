<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    authError,
    authRequest,
    AuthRequestError,
    listAccountProviders,
    oauthErrorMessage,
    readCapabilities,
    readSession,
    startSocial,
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
  let googleAvailable = $state(false);
  let providers = $state<string[] | null>(null);
  let nextPath = $state('/projetos');
  let deletePassword = $state('');
  let deleteConfirmation = $state('');
  let deleteMessage = $state('');
  let deleteError = $state(false);
  let reauthNeeded = $state(false);
  let deleteReady = $state(false);

  // Sem lista de provedores (falha), assume conta com senha: é o formulário que já existia.
  const hasPassword = $derived(providers === null || providers.includes('credential'));
  const googleLinked = $derived(providers?.includes('google') === true);
  const tabMode = $derived(mode === 'signup' ? 'signup' : 'login');

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
    const oauthError = url.searchParams.get('error');
    const connected = url.searchParams.get('conectado');
    const deleteStep = url.searchParams.get('excluir');
    if (oauthError || connected || deleteStep) {
      for (const key of ['error', 'conectado', 'excluir']) url.searchParams.delete(key);
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void Promise.all([
      readSession()
        .then((value) => (session = value))
        .catch(() => (message = 'Não foi possível consultar sua sessão.')),
      readCapabilities().then((value) => {
        resetAvailable = value.passwordReset;
        googleAvailable = value.google;
      }),
    ])
      .then(async () => {
        if (session) {
          providers = await listAccountProviders().catch(() => null);
          if (connected === 'google' && providers?.includes('google'))
            message = 'Google conectado. Agora você também pode entrar com ele.';
          if (deleteStep === 'confirmar') {
            deleteReady = true;
            reauthNeeded = false;
            await tick();
            const zone = document.getElementById('danger-zone');
            zone?.scrollIntoView({
              block: 'center',
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
            zone?.focus();
          }
        } else if (oauthError) {
          const result = oauthErrorMessage(oauthError);
          message = result.text;
          error = result.alert;
          if (oauthError === 'account_not_linked') {
            mode = 'login';
            email = '';
          }
        }
      })
      .finally(() => (checking = false));
  });

  // Troca de modo: o foco vai ao primeiro campo, exceto quando a troca vem das abas (o foco fica nelas).
  async function changeMode(next: typeof mode, focusField = true) {
    mode = next;
    message = '';
    error = false;
    if (!focusField) return;
    await tick();
    document
      .getElementById(next === 'signup' ? 'name' : next === 'reset' ? 'password' : 'email')
      ?.focus();
  }

  function onTabKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'login' : 'signup';
    void changeMode(next, false).then(() => document.getElementById(`tab-${next}`)?.focus());
  }

  async function continueWithGoogle() {
    loading = true;
    message = '';
    error = false;
    try {
      window.location.assign(await startSocial('sign-in/social', window.location.origin, nextPath));
    } catch (cause) {
      message = authError(cause);
      error = true;
      loading = false;
    }
  }

  async function connectGoogle() {
    loading = true;
    message = '';
    error = false;
    try {
      window.location.assign(
        await startSocial(
          'link-social',
          window.location.origin,
          `${resolve('/conta')}?conectado=google`,
        ),
      );
    } catch (cause) {
      message = authError(cause);
      error = true;
      loading = false;
    }
  }

  async function reauthenticateWithGoogle() {
    loading = true;
    deleteMessage = '';
    deleteError = false;
    try {
      window.location.assign(
        await startSocial(
          'sign-in/social',
          window.location.origin,
          `${resolve('/conta')}?excluir=confirmar`,
        ),
      );
    } catch (cause) {
      deleteMessage = authError(cause);
      deleteError = true;
      loading = false;
    }
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
    deleteMessage = '';
    deleteError = false;
    try {
      await authRequest('delete-user', hasPassword ? { password: deletePassword } : {});
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
      if (cause instanceof AuthRequestError && cause.code === 'REAUTH_REQUIRED') {
        reauthNeeded = true;
        deleteReady = false;
      }
      deleteMessage = authError(cause);
      deleteError = true;
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
      <div role={error ? 'alert' : 'status'}>
        {#if message}<p class:message-error={error} class="message">{message}</p>{/if}
      </div>
      <a class="button primary" href={resolve('/projetos')}>Abrir meus projetos</a>
      <button class="button secondary" disabled={loading} onclick={logout}>Sair da conta</button>
      <p class="local-draft-note">
        Ao sair, os rascunhos desta conta são removidos deste navegador. Exporte alterações ainda
        não salvas antes de sair.
      </p>

      {#if googleAvailable || googleLinked}
        <section class="linked" aria-labelledby="linked-title">
          <h3 id="linked-title">Entrar com o Google</h3>
          {#if googleLinked}
            <p class="linked-ok">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              Google conectado
            </p>
          {:else}
            <p>Conecte o Google para entrar com um toque, sem digitar a senha.</p>
            <button class="button google" type="button" disabled={loading} onclick={connectGoogle}>
              {@render googleLogo()}<span>Conectar Google</span>
            </button>
          {/if}
        </section>
      {/if}

      <section class="danger-zone" id="danger-zone" tabindex="-1" aria-labelledby="delete-title">
        <h3 id="delete-title">Excluir conta</h3>
        <p>Esta ação é permanente. Seus projetos, convidados, lugares e sessões serão apagados.</p>
        {#if deleteReady}
          <p class="ready" role="status">
            Identidade confirmada. Agora você pode excluir sua conta, se for isso mesmo que deseja.
          </p>
        {/if}
        {#if reauthNeeded && !hasPassword}
          <div role="alert" class="reauth">
            <p>Por segurança, confirme sua identidade com o Google.</p>
            <button
              class="button google"
              type="button"
              disabled={loading}
              onclick={reauthenticateWithGoogle}
            >
              {@render googleLogo()}<span>Confirmar com o Google</span>
            </button>
          </div>
        {:else}
          <form onsubmit={deleteAccount}>
            {#if hasPassword}
              <label for="delete-password">Confirme sua senha</label>
              <input
                id="delete-password"
                type="password"
                bind:value={deletePassword}
                autocomplete="current-password"
                aria-describedby={deleteMessage ? 'delete-message' : undefined}
                required
                minlength="12"
                maxlength="128"
              />
            {/if}
            <label for="delete-confirmation">Digite {session.user.email} para confirmar</label>
            <input
              id="delete-confirmation"
              type="email"
              bind:value={deleteConfirmation}
              autocomplete="off"
              aria-describedby={deleteMessage ? 'delete-message' : undefined}
              required
              maxlength="254"
            />
            <div id="delete-message" role={deleteError ? 'alert' : 'status'}>
              {#if deleteMessage}<p class:message-error={deleteError} class="message">
                  {deleteMessage}
                </p>{/if}
            </div>
            <button
              class="button destructive"
              disabled={loading || deleteConfirmation.trim() !== session.user.email}
            >
              {loading ? 'Aguarde…' : 'Excluir minha conta permanentemente'}
            </button>
          </form>
        {/if}
      </section>
    {:else}
      {#if mode !== 'reset'}
        {#if googleAvailable && mode !== 'recover'}
          <button
            class="button google"
            type="button"
            disabled={loading}
            onclick={continueWithGoogle}
          >
            {@render googleLogo()}<span>Continuar com o Google</span>
          </button>
          <p class="divider"><span>ou use seu e-mail</span></p>
        {/if}
        {#if mode !== 'recover'}
          <div class="tabs" role="tablist" aria-label="Acesso por e-mail">
            <button
              type="button"
              role="tab"
              id="tab-login"
              aria-selected={tabMode === 'login'}
              aria-controls="auth-panel"
              tabindex={tabMode === 'login' ? 0 : -1}
              onclick={() => changeMode('login', false)}
              onkeydown={onTabKeydown}>Entrar</button
            >
            <button
              type="button"
              role="tab"
              id="tab-signup"
              aria-selected={tabMode === 'signup'}
              aria-controls="auth-panel"
              tabindex={tabMode === 'signup' ? 0 : -1}
              onclick={() => changeMode('signup', false)}
              onkeydown={onTabKeydown}>Criar conta</button
            >
          </div>
        {/if}
      {/if}
      <div
        id="auth-panel"
        role={mode === 'login' || mode === 'signup' ? 'tabpanel' : undefined}
        aria-labelledby={mode === 'login' || mode === 'signup' ? `tab-${mode}` : 'account-title'}
      >
        {#key mode}
          <h2 id="account-title" class="mode-copy">
            {mode === 'signup'
              ? 'Criar conta'
              : mode === 'recover'
                ? 'Recuperar acesso'
                : mode === 'reset'
                  ? 'Criar nova senha'
                  : 'Bem-vinda(o) de volta'}
          </h2>
          <p class="mode-copy">
            {mode === 'signup'
              ? googleAvailable
                ? 'Guarde seus projetos e retome em outro dispositivo. Com o Google, você não precisa criar senha.'
                : 'Guarde seus projetos e retome em outro dispositivo.'
              : mode === 'recover'
                ? 'Informe o e-mail usado na conta.'
                : mode === 'reset'
                  ? 'Escolha uma senha nova para sua conta.'
                  : 'Entre para continuar de onde parou.'}
          </p>
        {/key}
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
          {#if mode === 'login'}{#if resetAvailable}<button
                type="button"
                onclick={() => changeMode('recover')}>Esqueci minha senha</button
              >{/if}
          {:else if mode === 'recover'}<button type="button" onclick={() => changeMode('login')}
              >Voltar para entrar</button
            >
          {/if}
        </nav>
      </div>
    {/if}
  </section>
</main>

{#snippet googleLogo()}
  <svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
{/snippet}

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
  .account-form p {
    margin: 0 0 22px;
    color: #626e63;
    line-height: 1.65;
  }
  .account-email {
    overflow-wrap: anywhere;
  }
  .local-draft-note {
    margin: 8px 0 0 !important;
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
  .primary:hover:not(:disabled) {
    background: #1e4433;
  }
  .secondary {
    margin-top: 10px;
    color: #295842;
    background: transparent;
  }
  .secondary:hover:not(:disabled) {
    background: #eaf1e9;
  }
  /* Botão do Google: fundo branco, borda cinza e logotipo oficial, conforme as diretrizes de marca. */
  .google {
    width: 100%;
    gap: 12px;
    color: #1f1f1f;
    background: #fff;
    border-color: #747775;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--dur-base) var(--ease-out);
  }
  .google:hover:not(:disabled) {
    background: #f6f8f6;
  }
  .google:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .g-logo {
    flex: none;
    width: 20px;
    height: 20px;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 20px 0 !important;
    color: #626e63;
    font-size: 13px;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #dfe3da;
  }
  .tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 22px;
    padding: 4px;
    background: #eef1ea;
    border-radius: 10px;
  }
  .tabs button {
    min-height: 44px;
    color: #3d4a40;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    transition:
      background var(--dur-base) var(--ease-out),
      color var(--dur-base) var(--ease-out);
  }
  .tabs button[aria-selected='true'] {
    color: #1e4433;
    background: #fffefb;
    box-shadow: 0 1px 3px rgb(39 52 44 / 0.18);
  }
  .tabs button:focus-visible,
  .google:focus-visible,
  .form-links button:focus-visible,
  .danger-zone:focus-visible {
    outline: 3px solid #295842;
    outline-offset: 2px;
  }
  .mode-copy {
    animation: rise-in var(--dur-base) var(--ease-out);
  }
  .linked {
    margin-top: 28px;
    padding-top: 22px;
    border-top: 1px solid #dfe3da;
  }
  .linked h3 {
    margin: 0 0 8px;
    color: #27342c;
    font:
      600 18px/1.3 Georgia,
      serif;
  }
  .linked > p {
    margin: 0 0 14px;
    font-size: 14px;
  }
  .linked-ok {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #295842 !important;
    font-weight: 650;
  }
  .linked-ok svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
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
  .danger-zone > .ready {
    color: #295842;
    font-weight: 650;
    animation: rise-in var(--dur-base) var(--ease-out);
  }
  .reauth p {
    margin: 0 0 12px;
    color: #6f514c;
    font-size: 14px;
  }
  .destructive {
    color: #fff;
    background: #873d35;
    border-color: #873d35;
  }
  .destructive:hover:not(:disabled) {
    background: #722f28;
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
  .form-links:empty {
    display: none;
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
    margin: 5px 0 !important;
    color: #295842 !important;
    font-size: 14px;
    animation: rise-in var(--dur-base) var(--ease-out);
  }
  .message-error {
    color: #923d35 !important;
    animation: nudge 240ms ease-in-out;
  }
  /* O erro não depende só da cor. */
  .message-error::before {
    content: 'Erro: ';
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    .mode-copy,
    .message,
    .message-error,
    .danger-zone > .ready {
      animation: none;
    }
    .google,
    .tabs button {
      transition: none;
    }
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
