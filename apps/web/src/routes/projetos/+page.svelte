<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { flip } from 'svelte/animate';
  import { slide } from 'svelte/transition';
  import { motionMs } from '../../lib/motion';
  import {
    MAX_PROJECT_FILE_BYTES,
    createDemoDocument,
    createProjectRequestSchema,
    createUuid,
    parseProjectFile,
    projectListResponseSchema,
    projectSnapshotSchema,
    projectWriteResponseSchema,
    type CreateProjectRequest,
    type CeremonyProject,
    type ProjectSummary,
  } from '@enlace/contracts';
  import { authRequest, readSession, type AccountSession } from '../../lib/account/client';
  import { clearAccountDraft } from '../../lib/editor/files/drafts';

  let session = $state<AccountSession | null>(null);
  let projects = $state<ProjectSummary[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let loaded = $state(false);
  let importRequest = $state<CreateProjectRequest | null>(null);
  let titleDrafts = $state<Record<string, string>>({});
  let deleting = $state<ProjectSummary | null>(null);
  let deleteDialog: HTMLDialogElement;
  let createRequest: CreateProjectRequest | null = null;
  let importInput: HTMLInputElement;
  let pageHeading: HTMLHeadingElement;

  // Botões ficam desabilitados durante a operação e o navegador pode soltar o foco no body.
  async function restoreFocus(previous: Element | null) {
    await tick();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  }

  onMount(() => {
    void initialize();
  });
  async function initialize() {
    loading = true;
    error = '';
    try {
      session = await readSession();
      if (!session) {
        window.location.replace(
          `${resolve('/conta')}?next=${encodeURIComponent(resolve('/projetos'))}`,
        );
        return;
      }
      await loadProjects();
      try {
        const raw = localStorage.getItem(`enlace:pending-import:v1:${session.user.id}`);
        if (raw) importRequest = createProjectRequestSchema.parse(JSON.parse(raw));
      } catch {
        error = 'Não foi possível recuperar a importação pendente neste navegador.';
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível carregar seus projetos.';
    } finally {
      loading = false;
    }
  }
  async function loadProjects() {
    const response = await fetch('/api/projects', { credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.replace(resolve('/conta'));
      return;
    }
    if (!response.ok) throw new Error('Não foi possível carregar seus projetos. Tente novamente.');
    const data = projectListResponseSchema.parse(await response.json());
    projects = data.projects;
    loaded = true;
    titleDrafts = Object.fromEntries(projects.map((item) => [item.id, item.title]));
  }
  async function createProject() {
    if (busy) return;
    const previous = document.activeElement;
    busy = true;
    error = '';
    try {
      if (!session) throw new Error('Entre na sua conta para criar um projeto.');
      const key = `enlace:pending-create:v1:${session.user.id}`;
      if (!createRequest) {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) createRequest = createProjectRequestSchema.parse(JSON.parse(raw));
        } catch {
          try {
            window.localStorage.removeItem(key);
          } catch {
            /* Armazenamento indisponível. */
          }
        }
      }
      if (!createRequest) {
        const document = createDemoDocument();
        const project: CeremonyProject = { ...document.project, title: 'Meu projeto' };
        createRequest = { id: createUuid(), operationId: createUuid(), project };
        try {
          window.localStorage.setItem(key, JSON.stringify(createRequest));
        } catch {
          /* Idempotency remains for retries in this page. */
        }
      }
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createRequest),
      });
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok) throw new Error('Não foi possível criar o projeto. Tente novamente.');
      const snapshot = projectSnapshotSchema.parse(await response.json());
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* The server response is authoritative. */
      }
      createRequest = null;
      window.location.assign(`${resolve('/editor')}?project=${encodeURIComponent(snapshot.id)}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível criar o projeto.';
    } finally {
      busy = false;
      void restoreFocus(previous);
    }
  }
  async function importProject(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy || importRequest) return;
    busy = true;
    error = '';
    try {
      if (!session) throw new Error('Entre na sua conta para importar um projeto.');
      if (file.size > MAX_PROJECT_FILE_BYTES)
        throw new Error('O arquivo excede o limite de 2 MiB e não foi importado.');
      let imported: CeremonyProject;
      try {
        imported = parseProjectFile(await file.text()).project;
      } catch {
        throw new Error('Arquivo inválido ou não reconhecido. Nenhum projeto foi criado.');
      }
      // A identidade é sempre nova; nenhum identificador do arquivo vira id ou proprietário.
      importRequest = {
        id: createUuid(),
        operationId: createUuid(),
        project: { ...imported, title: imported.title.trim() || 'Meu projeto' },
      };
      try {
        localStorage.setItem(
          `enlace:pending-import:v1:${session.user.id}`,
          JSON.stringify(importRequest),
        );
      } catch {
        // A identidade da operação permanece disponível enquanto esta página estiver aberta.
      }
      await submitImport();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível importar o projeto.';
    } finally {
      busy = false;
    }
  }
  async function submitImport() {
    if (!session || !importRequest) return;
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(importRequest),
      });
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok)
        throw new Error(
          'Não foi possível confirmar a importação. Tente novamente abaixo para evitar duplicar o projeto.',
        );
      const snapshot = projectSnapshotSchema.parse(await response.json());
      try {
        localStorage.removeItem(`enlace:pending-import:v1:${session.user.id}`);
      } catch {
        // Uma repetição mantém os mesmos IDs e retorna o projeto já criado.
      }
      importRequest = null;
      window.location.assign(`${resolve('/editor')}?project=${encodeURIComponent(snapshot.id)}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível importar o projeto.';
    } finally {
      busy = false;
    }
  }
  async function rename(item: ProjectSummary) {
    if (busy) return;
    const title = (titleDrafts[item.id] ?? '').trim();
    if (!title || title === item.title) {
      titleDrafts[item.id] = item.title;
      return;
    }
    const previous = document.activeElement;
    busy = true;
    error = '';
    try {
      const read = await fetch(`/api/projects/${encodeURIComponent(item.id)}`, {
        credentials: 'same-origin',
      });
      if (read.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!read.ok) throw new Error('Não foi possível abrir o projeto para renomeá-lo.');
      const snapshot = projectSnapshotSchema.parse(await read.json());
      const project = { ...snapshot.project, title };
      const response = await fetch(`/api/projects/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: snapshot.revision,
          operationId: createUuid(),
          project,
        }),
      });
      if (response.status === 409)
        throw new Error(
          'O projeto mudou em outro dispositivo. Atualize a lista antes de renomear.',
        );
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok) throw new Error('Não foi possível renomear o projeto.');
      projectWriteResponseSchema.parse(await response.json());
      await loadProjects();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível renomear o projeto.';
    } finally {
      busy = false;
      void restoreFocus(previous);
    }
  }
  function askDelete(item: ProjectSummary) {
    error = '';
    deleting = item;
    void Promise.resolve().then(() => deleteDialog.showModal());
  }
  async function deleteProject() {
    if (!deleting || busy) return;
    const target = deleting;
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: target.revision }),
      });
      if (response.status === 409)
        throw new Error(
          'O projeto mudou em outro dispositivo. Atualize a lista e tente novamente.',
        );
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok && response.status !== 204)
        throw new Error('Não foi possível excluir o projeto.');
      projects = projects.filter((item) => item.id !== target.id);
      deleteDialog.close();
      deleting = null;
      // O botão que abriu o diálogo deixou de existir: leva o foco ao título da página.
      await tick();
      pageHeading?.focus();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível excluir o projeto.';
    } finally {
      busy = false;
    }
  }
  async function logout() {
    busy = true;
    try {
      await authRequest('sign-out', {});
      try {
        if (session) clearAccountDraft(window.localStorage, session.user.id);
      } catch {
        session = null;
        projects = [];
        loaded = false;
        error =
          'Você saiu da conta, mas o navegador bloqueou a limpeza dos rascunhos. Limpe os dados deste site se estiver em um computador compartilhado.';
        return;
      }
      window.location.assign(resolve('/'));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível sair da conta.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head
  ><title>Meus projetos · Enlace</title><meta
    name="description"
    content="Abra e organize seus planejamentos de cerimônia."
  /></svelte:head
>

<header class="site-header">
  <a class="brand" href={resolve('/')} aria-label="Enlace, início"
    ><svg viewBox="0 0 36 36" aria-hidden="true"
      ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
    ><span>enlace</span></a
  >
  <nav aria-label="Principal">
    <a href={resolve('/conta')}>Minha conta</a>
    <a href={resolve('/editor')}>Editor local</a>{#if session}<span>{session.user.email}</span
      >{/if}<button disabled={busy} onclick={logout}>Sair</button>
  </nav>
</header>

<main class="projects-page">
  <div class="page-heading">
    <div>
      <h1 tabindex="-1" bind:this={pageHeading}>Meus projetos</h1>
      <p>Seus planejamentos salvos na conta.</p>
    </div>
    <div class="heading-actions">
      <button
        class="secondary"
        disabled={busy || loading || !session || !!importRequest}
        onclick={() => importInput.click()}>Importar JSON como novo projeto</button
      ><input
        bind:this={importInput}
        class="sr-only"
        type="file"
        accept=".json,application/json"
        tabindex="-1"
        aria-label="Arquivo JSON do projeto"
        onchange={importProject}
      />
      <button class="primary" disabled={busy || loading || !session} onclick={createProject}
        >Criar projeto</button
      >
    </div>
  </div>
  <p class="logout-note">
    Ao sair, os rascunhos desta conta são removidos deste navegador. Exporte alterações ainda não
    salvas antes de sair.
  </p>
  {#if error && !deleting}<p class="notice" role="alert">{error}</p>{/if}
  {#if importRequest}
    <section class="notice" aria-label="Importação pendente">
      <p>
        A importação de “{importRequest.project.title}” ainda precisa de confirmação. Repetir usa a
        mesma operação, sem criar outra cópia.
      </p>
      <button class="secondary" disabled={busy} onclick={submitImport}
        >Confirmar importação pendente</button
      >
    </section>
  {/if}
  <div role="status">
    {#if loading}<div class="loading">
        <svg class="rings-loader" viewBox="0 0 36 36" aria-hidden="true"
          ><ellipse pathLength="1" cx="14" cy="18" rx="8" ry="11" /><ellipse
            pathLength="1"
            cx="23"
            cy="18"
            rx="8"
            ry="11"
          /></svg
        >
        <p>Carregando seus projetos…</p>
      </div>{/if}
  </div>
  {#if loading}
    <!-- Estado anunciado pela região acima. -->
  {:else if !loaded}<button class="secondary" disabled={busy} onclick={initialize}
      >Tentar carregar novamente</button
    >
  {:else if projects.length === 0}<section class="empty">
      <h2>Seu próximo planejamento começa aqui.</h2>
      <p>Crie um projeto para organizar a planta, os convidados e os lugares em sua conta.</p>
      <button class="primary" disabled={busy} onclick={createProject}>Criar primeiro projeto</button
      >
    </section>
  {:else}<ul class="project-list">
      {#each projects as item, index (item.id)}
        <li
          style:--row={index}
          animate:flip={{ duration: motionMs(280) }}
          out:slide={{ duration: motionMs(200) }}
        >
          <div class="project-copy">
            <a
              class="project-title"
              href={resolve(`/editor?project=${encodeURIComponent(item.id)}`)}>{item.title}</a
            >
            <p>
              Atualizado em {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(item.updatedAt))}
            </p>
          </div>
          <div class="project-actions">
            <label class="sr-only" for={`title-${item.id}`}>Nome do projeto {item.title}</label
            ><input
              id={`title-${item.id}`}
              maxlength="120"
              bind:value={titleDrafts[item.id]}
              onkeydown={(event) => event.key === 'Enter' && rename(item)}
            /><button disabled={busy} onclick={() => rename(item)}>Renomear</button><button
              class="delete"
              disabled={busy}
              onclick={() => askDelete(item)}>Excluir</button
            >
          </div>
        </li>
      {/each}
    </ul>{/if}
</main>

<dialog
  bind:this={deleteDialog}
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
  onclose={() => (deleting = null)}
  aria-labelledby="delete-title"
>
  <h2 id="delete-title">Excluir este projeto?</h2>
  <p>
    {deleting?.title} e seu planejamento serão removidos da conta. Esta ação não pode ser desfeita.
  </p>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    <button disabled={busy} onclick={() => deleteDialog.close()}>Cancelar</button><button
      class="delete-confirm"
      disabled={busy}
      onclick={deleteProject}>{busy ? 'Excluindo…' : 'Excluir projeto'}</button
    >
  </div>
</dialog>

<style>
  .projects-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: clamp(34px, 6vw, 72px) clamp(24px, 6vw, 76px) 90px;
  }
  .site-header nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 22px;
    color: #626e63;
    font-size: 14px;
  }
  .site-header nav a {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    color: #295842;
  }
  .site-header nav button {
    padding: 8px 12px;
    color: #295842;
    border: 1px solid #aebead;
    border-radius: 8px;
    background: transparent;
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 20px;
    margin-bottom: 34px;
  }
  h1 {
    margin: 0;
    color: #27342c;
    font:
      400 clamp(34px, 4vw, 48px)/1.15 Georgia,
      serif;
    letter-spacing: -0.03em;
  }
  .page-heading p {
    margin: 9px 0 0;
    color: #626e63;
  }
  .logout-note {
    color: #626e63;
    font-size: 14px;
    line-height: 1.6;
    max-width: 70ch;
    margin-bottom: 24px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .primary {
    padding: 12px 17px;
    color: #fffefb;
    background: #295842;
    border: 1px solid #295842;
    border-radius: 9px;
    font-weight: 650;
  }
  .heading-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: 10px;
  }
  .secondary {
    padding: 12px 17px;
    color: #295842;
    background: transparent;
    border: 1px solid #aebead;
    border-radius: 9px;
  }
  .project-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border-top: 1px solid #dfe3da;
  }
  .project-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 30px;
    padding: 23px 0;
    border-bottom: 1px solid #dfe3da;
    animation: rise-in var(--dur-slow) var(--ease-out) min(calc(var(--row) * 35ms), 210ms) backwards;
  }
  .primary:hover:not(:disabled) {
    background: #1e4433;
  }
  .secondary:hover:not(:disabled),
  .site-header nav button:hover:not(:disabled),
  .project-actions button:hover:not(:disabled),
  .dialog-actions button:hover:not(:disabled) {
    background: #eaf1e9;
  }
  .project-actions .delete:hover:not(:disabled) {
    background: #fbefeb;
  }
  .dialog-actions .delete-confirm:hover:not(:disabled) {
    background: #7c322b;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .empty,
  .notice {
    animation: rise-in var(--dur-slow) var(--ease-out);
  }
  .project-copy {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .project-title {
    color: #27342c;
    font:
      400 22px Georgia,
      serif;
    text-decoration-color: #aebead;
    text-underline-offset: 4px;
  }
  .project-copy p {
    margin: 7px 0 0;
    color: #626e63;
    font-size: 13px;
  }
  .project-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: end;
    gap: 8px;
  }
  .project-actions input {
    width: min(230px, 28vw);
    min-width: 130px;
    height: 39px;
    padding: 7px 10px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    background: #fffefb;
  }
  .project-actions button,
  .dialog-actions button {
    padding: 9px 11px;
    color: #295842;
    background: transparent;
    border: 1px solid #aebead;
    border-radius: 8px;
  }
  .project-actions .delete {
    color: #923d35;
    border-color: #d5b3ad;
  }
  .empty {
    max-width: 610px;
    padding: 30px 0;
    border-top: 1px solid #dfe3da;
  }
  .empty h2,
  dialog h2 {
    margin: 0;
    font:
      400 26px Georgia,
      serif;
  }
  .empty p,
  dialog p {
    color: #626e63;
    line-height: 1.7;
  }
  .notice {
    padding: 12px 15px;
    color: #923d35;
    background: #fbefeb;
    border: 1px solid #e3c8c2;
    border-radius: 8px;
  }
  /* O erro não depende só da cor. */
  .notice[role='alert']::before {
    content: 'Erro: ';
    font-weight: 700;
  }
  dialog {
    width: min(440px, calc(100% - 32px));
    padding: 27px;
    color: #27342c;
    background: #fffefb;
    border: 1px solid #dfe3da;
    border-radius: 14px;
  }
  dialog::backdrop {
    background: rgb(28 39 31 / 35%);
  }
  .dialog-actions {
    display: flex;
    justify-content: end;
    gap: 10px;
    margin-top: 22px;
  }
  .dialog-actions .delete-confirm {
    color: white;
    background: #923d35;
    border-color: #923d35;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 740px) {
    .site-header {
      min-height: 76px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .site-header nav {
      gap: 11px;
    }
    .site-header nav span {
      display: none;
    }
    .projects-page {
      padding-top: 36px;
    }
    .project-list li {
      align-items: stretch;
      flex-direction: column;
      gap: 15px;
    }
    .project-actions {
      justify-content: start;
    }
    .project-actions input {
      flex: 1;
      width: auto;
    }
  }
  @media (max-width: 480px) {
    .page-heading {
      align-items: start;
      flex-direction: column;
    }
    .site-header nav {
      font-size: 12px;
    }
  }
</style>
