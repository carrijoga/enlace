<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    createDemoDocument,
    createProjectRequestSchema,
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
  let titleDrafts = $state<Record<string, string>>({});
  let deleting = $state<ProjectSummary | null>(null);
  let deleteDialog: HTMLDialogElement;
  let createRequest: CreateProjectRequest | null = null;

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
    titleDrafts = Object.fromEntries(projects.map((item) => [item.id, item.title]));
  }
  async function createProject() {
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
          window.localStorage.removeItem(key);
        }
      }
      if (!createRequest) {
        const document = createDemoDocument();
        const project: CeremonyProject = { ...document.project, title: 'Meu projeto' };
        createRequest = { id: crypto.randomUUID(), operationId: crypto.randomUUID(), project };
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
    }
  }
  async function rename(item: ProjectSummary) {
    const title = (titleDrafts[item.id] ?? '').trim();
    if (!title || title === item.title) {
      titleDrafts[item.id] = item.title;
      return;
    }
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
          operationId: crypto.randomUUID(),
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
    }
  }
  function askDelete(item: ProjectSummary) {
    deleting = item;
    void Promise.resolve().then(() => deleteDialog.showModal());
  }
  async function deleteProject() {
    if (!deleting) return;
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(deleting.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: deleting.revision }),
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
      projects = projects.filter((item) => item.id !== deleting?.id);
      deleteDialog.close();
      deleting = null;
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
      if (session) clearAccountDraft(window.localStorage, session.user.id);
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
  <nav>
    <a href={resolve('/editor')}>Editor local</a>{#if session}<span>{session.user.email}</span
      >{/if}<button disabled={busy} onclick={logout}>Sair</button>
  </nav>
</header>

<main class="projects-page">
  <div class="page-heading">
    <div>
      <h1>Meus projetos</h1>
      <p>Seus planejamentos salvos na conta.</p>
    </div>
    <button class="primary" disabled={busy || loading} onclick={createProject}>Criar projeto</button
    >
  </div>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  {#if loading}<p role="status">Carregando seus projetos…</p>
  {:else if projects.length === 0}<section class="empty">
      <h2>Seu próximo planejamento começa aqui.</h2>
      <p>Crie um projeto para organizar a planta, os convidados e os lugares em sua conta.</p>
      <button class="primary" disabled={busy} onclick={createProject}>Criar primeiro projeto</button
      >
    </section>
  {:else}<ul class="project-list">
      {#each projects as item (item.id)}
        <li>
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

<dialog bind:this={deleteDialog} onclose={() => (deleting = null)} aria-labelledby="delete-title">
  <h2 id="delete-title">Excluir este projeto?</h2>
  <p>
    {deleting?.title} e seu planejamento serão removidos da conta. Esta ação não pode ser desfeita.
  </p>
  <div class="dialog-actions">
    <button onclick={() => deleteDialog.close()}>Cancelar</button><button
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
    align-items: center;
    gap: 22px;
    color: #626e63;
    font-size: 14px;
  }
  .site-header nav a {
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
  }
  .project-copy {
    min-width: 180px;
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
    border: 1px solid #bfc9bd;
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
