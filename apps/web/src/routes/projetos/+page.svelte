<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import { flip } from 'svelte/animate';
  import { fly, slide } from 'svelte/transition';
  import WorkspaceHeader from '../../lib/account/WorkspaceHeader.svelte';
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
  import { readSession, type AccountSession } from '../../lib/account/client';

  const updatedAtFormat = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let session = $state<AccountSession | null>(null);
  let projects = $state<ProjectSummary[]>([]);
  let loading = $state(true);
  let operation = $state<'create' | 'import' | 'rename' | 'delete' | 'refresh' | null>(null);
  let busy = $derived(operation !== null);
  let error = $state('');
  let loaded = $state(false);
  let refreshNeeded = $state(false);
  let query = $state('');
  let searchQuery = $derived(normalizeSearch(query));
  let listMotion = $state(false);
  let visibleProjects = $derived(
    searchQuery
      ? projects.filter((item) => normalizeSearch(item.title).includes(searchQuery))
      : projects,
  );
  let importRequest = $state<CreateProjectRequest | null>(null);
  let openOptions = $state<string | null>(null);
  let renaming = $state(false);
  let titleDraft = $state('');
  let renamingError = $state('');
  let deleting = $state<ProjectSummary | null>(null);
  let sharing = $state<ProjectSummary | null>(null);
  let shareDialog = $state<typeof import('../../lib/share/ShareDialog.svelte').default | null>(
    null,
  );
  let shareTrigger: HTMLButtonElement | null = null;
  let deleteDialog: HTMLDialogElement;
  let createRequest: CreateProjectRequest | null = null;
  let importInput: HTMLInputElement;
  let importButton: HTMLButtonElement;
  let retryImportButton = $state<HTMLButtonElement | null>(null);
  let retryLoadButton = $state<HTMLButtonElement | null>(null);
  let renameInput = $state<HTMLInputElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let pageHeading: HTMLHeadingElement;

  function normalizeSearch(value: string) {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
  }

  function toggleOptions(item: ProjectSummary) {
    openOptions = openOptions === item.id ? null : item.id;
    renaming = false;
    renamingError = '';
  }

  async function startRename(item: ProjectSummary) {
    titleDraft = item.title;
    renamingError = '';
    renaming = true;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  async function closeRename(item: ProjectSummary) {
    renaming = false;
    renamingError = '';
    await tick();
    (document.getElementById(`rename-${item.id}`) ?? searchInput ?? pageHeading)?.focus();
  }

  // Botões ficam desabilitados durante a operação e o navegador pode soltar o foco no body.
  async function restoreFocus(previous: Element | null) {
    await tick();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  }

  onMount(() => {
    void initialize();
  });
  async function initialize(restoreAfterLoad = false) {
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
      try {
        const raw = localStorage.getItem(`enlace:pending-import:v1:${session.user.id}`);
        if (raw) importRequest = createProjectRequestSchema.parse(JSON.parse(raw));
      } catch {
        error = 'Não foi possível recuperar a importação pendente neste navegador.';
      }
      await loadProjects();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível carregar seus projetos.';
    } finally {
      loading = false;
      if (restoreAfterLoad) {
        await tick();
        (loaded ? pageHeading : retryLoadButton)?.focus();
      }
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
    listMotion = !searchQuery;
    projects = data.projects;
    loaded = true;
    refreshNeeded = false;
  }
  async function refreshProjects() {
    if (busy) return;
    const previous = document.activeElement;
    operation = 'refresh';
    error = '';
    try {
      await loadProjects();
      renamingError = '';
      await tick();
      (renameInput ?? pageHeading)?.focus();
    } catch {
      error = 'Não foi possível atualizar a lista. Tente novamente.';
      void restoreFocus(previous);
    } finally {
      operation = null;
    }
  }
  function projectChanged() {
    refreshNeeded = true;
    return new Error('O projeto mudou desde o carregamento. Atualize a lista e tente novamente.');
  }
  async function createProject() {
    if (busy) return;
    const previous = document.activeElement;
    operation = 'create';
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
      operation = null;
      void restoreFocus(previous);
    }
  }
  async function importProject(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy || importRequest) return;
    operation = 'import';
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
      operation = null;
      await tick();
      (retryImportButton ?? importButton)?.focus();
    }
  }
  async function submitImport() {
    if (!session || !importRequest) return;
    operation = 'import';
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
      operation = null;
      if (importRequest) void restoreFocus(retryImportButton);
    }
  }
  async function rename(item: ProjectSummary) {
    if (busy) return;
    const title = titleDraft.trim();
    if (!title) {
      renamingError = 'Digite um nome para o projeto.';
      renameInput?.focus();
      return;
    }
    if (title === item.title) {
      void closeRename(item);
      return;
    }
    const previous = document.activeElement;
    operation = 'rename';
    error = '';
    renamingError = '';
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
      if (snapshot.project.title !== item.title) throw projectChanged();
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
      if (response.status === 409) throw projectChanged();
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok) throw new Error('Não foi possível renomear o projeto.');
      const updated = projectWriteResponseSchema.parse(await response.json());
      const updatedItem = { ...updated, title };
      listMotion = !searchQuery;
      projects = projects
        .map((project) => (project.id === item.id ? updatedItem : project))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    } catch (cause) {
      renamingError =
        cause instanceof Error ? cause.message : 'Não foi possível renomear o projeto.';
    } finally {
      operation = null;
    }
    if (renamingError) void restoreFocus(previous);
    else void closeRename(item);
  }
  async function openShare(item: ProjectSummary, trigger: HTMLButtonElement) {
    shareTrigger = trigger;
    try {
      shareDialog ??= (await import('../../lib/share/ShareDialog.svelte')).default;
      sharing = item;
    } catch {
      error = 'Não foi possível abrir o compartilhamento. Verifique a conexão.';
    }
  }
  function closeShare() {
    sharing = null;
    void tick().then(() => shareTrigger?.focus());
  }
  function askDelete(item: ProjectSummary) {
    error = '';
    deleting = item;
    void Promise.resolve().then(() => deleteDialog.showModal());
  }
  async function deleteProject() {
    if (!deleting || busy) return;
    const target = deleting;
    operation = 'delete';
    error = '';
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: target.revision }),
      });
      if (response.status === 409) throw projectChanged();
      if (response.status === 401) {
        window.location.assign(resolve('/conta'));
        return;
      }
      if (!response.ok && response.status !== 204)
        throw new Error('Não foi possível excluir o projeto.');
      listMotion = !searchQuery;
      projects = projects.filter((item) => item.id !== target.id);
      deleteDialog.close();
      deleting = null;
      // O botão que abriu o diálogo deixou de existir: leva o foco ao título da página.
      await tick();
      pageHeading?.focus();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Não foi possível excluir o projeto.';
    } finally {
      operation = null;
    }
  }
</script>

<svelte:head>
  <title>Meus projetos · Enlace</title>
  <meta name="description" content="Abra e organize seus planejamentos de cerimônia." />
</svelte:head>

<WorkspaceHeader current="projetos" />

<main class="projects-page">
  <div class="page-heading">
    <div>
      <h1 tabindex="-1" bind:this={pageHeading}>Meus projetos</h1>
      <p>Planejamentos salvos na sua conta.</p>
    </div>
    <div class="heading-actions">
      <button class="primary" disabled={busy || loading || !session} onclick={createProject}>
        {operation === 'create' ? 'Criando projeto…' : 'Criar projeto'}
      </button>
      <button
        bind:this={importButton}
        class="secondary"
        disabled={busy || loading || !session || !!importRequest}
        onclick={() => importInput.click()}
      >
        {operation === 'import' && !importRequest ? 'Lendo arquivo…' : 'Importar JSON'}
      </button>
      <input
        bind:this={importInput}
        hidden
        type="file"
        accept=".json,application/json"
        onchange={importProject}
      />
    </div>
  </div>
  {#if error && !deleting}
    <p class="notice" role="alert">{error}</p>
  {/if}
  {#if importRequest}
    <section class="pending-import" aria-labelledby="pending-import-heading">
      <div>
        <h2 id="pending-import-heading">Importação pendente</h2>
        <p>Confirme a importação de “{importRequest.project.title}” para criar uma única cópia.</p>
      </div>
      <button
        bind:this={retryImportButton}
        class="secondary"
        disabled={busy || loading}
        onclick={submitImport}
      >
        {operation === 'import' ? 'Importando…' : 'Confirmar importação'}
      </button>
    </section>
  {/if}

  <div class="sr-only" role="status">
    {#if loading}Carregando seus projetos…
    {:else if operation === 'create'}Criando projeto…
    {:else if operation === 'import'}Importando projeto…
    {:else if operation === 'refresh'}Atualizando a lista…
    {:else if loaded && searchQuery}
      {visibleProjects.length}
      {visibleProjects.length === 1 ? 'projeto encontrado' : 'projetos encontrados'}
    {/if}
  </div>

  {#if loading}
    <div class="loading-list" aria-hidden="true">
      <p>Carregando seus projetos…</p>
      <div class="placeholder"><span></span><span></span></div>
      <div class="placeholder"><span></span><span></span></div>
    </div>
  {:else if !loaded}
    <button
      bind:this={retryLoadButton}
      class="secondary"
      disabled={busy}
      onclick={() => initialize(true)}>Tentar novamente</button
    >
  {:else if projects.length === 0}
    <section class="empty">
      <h2>Nenhum projeto salvo</h2>
      <p>
        Crie um projeto para montar a planta e organizar os lugares da cerimônia. Se você já tem um
        backup do Enlace, importe o arquivo JSON.
      </p>
    </section>
  {:else}
    {#if projects.length > 1 || query || refreshNeeded}
      <div class="list-tools">
        {#if projects.length > 1 || query}
          <label class="search">
            <span>Buscar por nome</span>
            <input
              bind:this={searchInput}
              bind:value={query}
              type="search"
              oninput={() => (listMotion = false)}
            />
          </label>
        {/if}
        {#if refreshNeeded}
          <button class="secondary" disabled={busy} onclick={refreshProjects}>
            {operation === 'refresh' ? 'Atualizando…' : 'Atualizar lista'}
          </button>
        {/if}
      </div>
    {/if}
    {#if visibleProjects.length === 0}
      <section class="empty">
        <h2>Nenhum projeto encontrado</h2>
        <p>Tente buscar pelo nome completo ou por parte dele.</p>
        <button
          class="secondary"
          onclick={() => {
            listMotion = false;
            query = '';
            void tick().then(() => (searchInput ?? pageHeading)?.focus());
          }}>Limpar busca</button
        >
      </section>
    {:else}
      <ul class="project-list" aria-label="Projetos salvos">
        {#each visibleProjects as item, index (item.id)}
          <li
            animate:flip={{ duration: listMotion ? motionMs(280) : 0 }}
            in:fly={{
              y: 6,
              delay: listMotion ? motionMs(Math.min(index * 35, 210)) : 0,
              duration: listMotion ? motionMs(320) : 0,
            }}
            out:slide={{ duration: listMotion ? motionMs(200) : 0 }}
          >
            <div class="project-row">
              <a
                class="open-project"
                href={resolve(`/editor?project=${encodeURIComponent(item.id)}`)}
                aria-labelledby={`open-label-${item.id} title-${item.id}`}
              >
                <span class="project-copy">
                  <span class="project-title" id={`title-${item.id}`}>{item.title}</span>
                  <span class="project-date">
                    Atualizado em <time datetime={item.updatedAt}
                      >{updatedAtFormat.format(new Date(item.updatedAt))}</time
                    >
                  </span>
                </span>
                <span class="open-label" id={`open-label-${item.id}`}>
                  Abrir
                  <svg viewBox="0 0 16 16" aria-hidden="true"
                    ><path d="M2.5 8h10m-4-4 4 4-4 4" /></svg
                  >
                </span>
              </a>
              <button
                class="options-button"
                aria-label={`Opções de ${item.title}`}
                aria-expanded={openOptions === item.id}
                aria-controls={`options-${item.id}`}
                disabled={busy}
                onclick={() => toggleOptions(item)}>Opções</button
              >
            </div>
            <div class="project-options" id={`options-${item.id}`} hidden={openOptions !== item.id}>
              {#if openOptions === item.id}
                {#if renaming}
                  <form
                    class="rename-form"
                    onsubmit={(event) => {
                      event.preventDefault();
                      void rename(item);
                    }}
                  >
                    <label for={`name-${item.id}`}>Nome do projeto</label>
                    <div class="rename-controls">
                      <input
                        bind:this={renameInput}
                        bind:value={titleDraft}
                        id={`name-${item.id}`}
                        maxlength="120"
                        readonly={busy}
                        onkeydown={(event) => {
                          if (event.key === 'Escape' && !busy) void closeRename(item);
                        }}
                      />
                      <button class="primary" type="submit" disabled={busy || refreshNeeded}>
                        {operation === 'rename' ? 'Salvando…' : 'Salvar nome'}
                      </button>
                      <button
                        class="secondary"
                        type="button"
                        disabled={busy}
                        onclick={() => closeRename(item)}
                      >
                        Cancelar
                      </button>
                    </div>
                    {#if renamingError}<p class="notice" role="alert">{renamingError}</p>{/if}
                  </form>
                {:else}
                  <div class="project-actions">
                    <button
                      class="secondary"
                      id={`rename-${item.id}`}
                      disabled={busy}
                      onclick={() => startRename(item)}>Renomear</button
                    >
                    <button
                      class="secondary"
                      disabled={busy}
                      onclick={(event) => openShare(item, event.currentTarget)}>Compartilhar</button
                    >
                    <button class="secondary delete" disabled={busy} onclick={() => askDelete(item)}
                      >Excluir</button
                    >
                  </div>
                {/if}
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

{#if shareDialog && sharing}
  {@const ShareDialog = shareDialog}
  <ShareDialog projectId={sharing.id} projectTitle={sharing.title} onClose={closeShare} />
{/if}

<dialog
  bind:this={deleteDialog}
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
  onclose={() => (deleting = null)}
  aria-labelledby="delete-title"
  aria-describedby="delete-description"
>
  <h2 id="delete-title">Excluir este projeto?</h2>
  <p id="delete-description">
    “{deleting?.title}” e seu planejamento serão removidos da conta. Esta ação não pode ser
    desfeita.
  </p>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  <div class="dialog-actions">
    <button class="secondary" disabled={busy} onclick={() => deleteDialog.close()}>Cancelar</button>
    <button class="delete-confirm" disabled={busy || refreshNeeded} onclick={deleteProject}
      >{operation === 'delete' ? 'Excluindo…' : 'Excluir projeto'}</button
    >
  </div>
</dialog>

<style>
  .projects-page {
    max-width: 1120px;
    margin-inline: auto;
    padding: 58px clamp(20px, 5vw, 56px) 80px;
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 26px;
    padding-bottom: 25px;
    margin-bottom: 26px;
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font:
      400 2.75rem/1.12 Georgia,
      serif;
    letter-spacing: -0.03em;
  }
  .page-heading p {
    margin: 9px 0 0;
    color: var(--muted);
  }
  .heading-actions,
  .project-actions,
  .rename-controls,
  .dialog-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .primary,
  .secondary,
  .options-button,
  .delete-confirm {
    min-height: 44px;
    padding: 9px 14px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 650;
  }
  .primary {
    color: var(--paper);
    background: var(--green);
  }
  .primary:hover:not(:disabled) {
    background: #1e4433;
  }
  .secondary,
  .options-button {
    color: var(--green);
    background: transparent;
    border-color: var(--field-line);
  }
  .secondary:hover:not(:disabled),
  .options-button:hover:not(:disabled),
  .options-button[aria-expanded='true'] {
    background: #eaf1e9;
  }
  .list-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 12px;
    margin-bottom: 16px;
  }
  .search {
    display: grid;
    gap: 6px;
    width: min(100%, 335px);
  }
  .search span,
  .rename-form label {
    font-size: 0.875rem;
    font-weight: 650;
  }
  .search input,
  .rename-controls input {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 12px;
    color: inherit;
    border: 1px solid var(--field-line);
    border-radius: 8px;
    background: var(--paper);
  }
  .project-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
  }
  .project-list li + li {
    border-top: 1px solid var(--line);
  }
  .project-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 5px 16px 5px 5px;
  }
  .open-project {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 13px 12px 13px 15px;
    border-radius: 8px;
    text-decoration: none;
    transition: background-color var(--dur-fast) ease-out;
  }
  .open-project:hover,
  .open-project:focus-visible {
    background: #f3f6ee;
  }
  .open-project:focus-visible,
  .options-button:focus-visible {
    outline-offset: 1px;
  }
  .project-copy {
    display: grid;
    min-width: 0;
    gap: 5px;
    overflow-wrap: anywhere;
  }
  .project-title {
    font-size: 1.0625rem;
    font-weight: 650;
    line-height: 1.3;
  }
  .project-date {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
  .open-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--green);
    font-size: 0.875rem;
    font-weight: 650;
  }
  .open-label svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .project-options {
    padding: 12px 20px 16px;
    border-top: 1px solid var(--line);
    background: #f7f8f3;
  }
  .project-list li:last-child .project-options {
    border-radius: 0 0 13px 13px;
  }
  .rename-form {
    display: grid;
    gap: 8px;
  }
  .rename-controls input {
    flex: 1 1 228px;
    max-width: 360px;
  }
  .delete {
    color: #923d35;
    border-color: #a76a62;
  }
  .delete:hover:not(:disabled) {
    background: #fbefeb;
  }
  .empty,
  .loading-list {
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
  }
  .empty h2,
  dialog h2 {
    margin: 0;
    font:
      400 1.5rem/1.2 Georgia,
      serif;
  }
  .empty p,
  dialog p {
    max-width: 65ch;
    margin: 10px 0 0;
    color: var(--muted);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .empty button {
    margin-top: 14px;
  }
  .loading-list p {
    margin: 0 0 12px;
    color: var(--muted);
  }
  .placeholder {
    display: grid;
    gap: 8px;
    padding: 12px 0;
  }
  .placeholder + .placeholder {
    border-top: 1px solid var(--line);
  }
  .placeholder span {
    width: min(40%, 240px);
    height: 14px;
    border-radius: 4px;
    background: #edf0e7;
  }
  .placeholder span + span {
    width: min(55%, 305px);
    height: 10px;
  }
  .notice {
    padding: 12px 15px;
    color: #923d35;
    background: #fbefeb;
    border: 1px solid #e3c8c2;
    border-radius: 8px;
  }
  .notice::before {
    content: 'Erro: ';
    font-weight: 700;
  }
  .rename-form .notice {
    margin: 4px 0 0;
  }
  .pending-import {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
    padding: 15px 18px;
    border: 1px solid #dccbb0;
    border-radius: 12px;
    background: #faf4e8;
  }
  .pending-import div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .pending-import h2 {
    margin: 0;
    font-size: 1rem;
  }
  .pending-import p {
    margin: 5px 0 0;
    color: #564a37;
    font-size: 0.9375rem;
  }
  dialog {
    width: min(440px, calc(100% - 32px));
    padding: 26px;
    color: #27342c;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  dialog::backdrop {
    background: rgb(28 39 31 / 35%);
  }
  .dialog-actions {
    justify-content: end;
    margin-top: 22px;
  }
  .delete-confirm {
    color: var(--paper);
    background: #923d35;
  }
  .delete-confirm:hover:not(:disabled) {
    background: #7c322b;
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
  @media (max-width: 640px) {
    .projects-page {
      padding-top: 32px;
    }
    .page-heading {
      align-items: start;
      flex-direction: column;
      gap: 18px;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 2.125rem;
    }
    .project-row {
      padding: 4px 9px 4px 4px;
      gap: 6px;
    }
    .open-project {
      grid-template-columns: minmax(0, 1fr);
      gap: 5px;
      padding: 10px 8px;
    }
    .options-button {
      padding-inline: 10px;
    }
    .project-options {
      padding-inline: 12px;
    }
  }
</style>
