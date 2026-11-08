<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { resolve } from '$app/paths';
  import {
    parseProjectFile,
    MAX_PROJECT_FILE_BYTES,
    projectSnapshotSchema,
    projectWriteResponseSchema,
    type ProjectSnapshot,
    type SaveProjectRequest,
    type CeremonyProject,
  } from '@enlace/contracts';
  import {
    createInitialProject,
    createSampleProject,
    getLayoutGeometry,
    getSeatLabel,
    setLayout,
    setProjectDetails,
    addRow,
    removeRow,
    setRowCount,
    addGuest,
    updateGuest,
    removeGuest,
    assignGuest,
    unassignSeat,
  } from '@enlace/domain';
  import PlanCanvas from '../../lib/editor/PlanCanvas.svelte';
  import StructurePanel from '../../lib/editor/StructurePanel.svelte';
  import GuestsPanel from '../../lib/editor/GuestsPanel.svelte';
  import { GUEST_CATEGORIES, type GuestCategory } from '../../lib/editor/guest-categories';
  import {
    accountDraftKey,
    loadAccountDraft,
    loadDraft,
    saveAccountDraft,
    saveDraft,
    type AccountDraft,
  } from '../../lib/editor/files/drafts';
  import { readSession, type AccountSession } from '../../lib/account/client';
  import {
    selectWriteRequest,
    stateAfterAcknowledgement,
    writesBlocked,
  } from '../../lib/editor/remote-sync';

  type ProjectAction = (current: CeremonyProject) => CeremonyProject;
  // Comandos de domínio substituem snapshots imutáveis: não observar cada campo.
  let project = $state.raw<CeremonyProject | null>(null);
  let past = $state.raw<CeremonyProject[]>([]);
  let future = $state.raw<CeremonyProject[]>([]);
  let selectedGuestId = $state<string | null>(null);
  let selectedSeatId = $state<string | null>(null);
  let mobilePanel = $state<'structure' | 'guests'>('structure');
  let zoom = $state(0);
  let status = $state<'pending' | 'saved' | 'error' | 'blocked' | 'conflict' | 'expired'>(
    'pending',
  );
  let feedback = $state('');
  let feedbackError = $state(false);
  let rawDraft = $state<string | null>(null);
  let allowSave = true;
  let restored = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let fileInput: HTMLInputElement;
  let confirmDialog: HTMLDialogElement;
  let exportMenu: HTMLDetailsElement;
  let confirmation = $state.raw<{
    next: CeremonyProject;
    title: string;
    detail: string;
    replaceCorrupt?: boolean;
  } | null>(null);
  let editTimes = $state<number[]>([]);
  let exporting = $state<string | null>(null);
  let accountSession = $state<AccountSession | null>(null);
  let projectId = $state<string | null>(null);
  let revision = $state<number | null>(null);
  let conflictSnapshot = $state<ProjectSnapshot | null>(null);
  let retryRequest: SaveProjectRequest | null = null;
  let savingRemote = false;
  let accountKey: string | null = null;
  let remoteReady = false;
  let accountDraftCorrupt = false;
  let rawAccountDraft = $state<string | null>(null);
  const geometry = $derived(project ? getLayoutGeometry(project.layout) : null);
  const total = $derived(geometry?.seats.length ?? 0);
  const assigned = $derived(project?.assignments.length ?? 0);
  const personalId = $derived(
    selectedGuestId ??
      project?.assignments.find((a) => a.seatId === selectedSeatId)?.guestId ??
      null,
  );
  const personalGuest = $derived(project?.guests.find((guest) => guest.id === personalId));
  const canExportPersonal = $derived(
    Boolean(project && personalId && project.assignments.some((a) => a.guestId === personalId)),
  );

  function announce(text: string, error = false) {
    feedback = text;
    feedbackError = error;
  }
  function saveNow() {
    if (projectId) {
      if (!accountDraftCorrupt && project && accountSession && revision !== null && accountKey)
        persistAccountDraft();
      return;
    }
    if (!project || !allowSave) return;
    try {
      saveDraft(window.localStorage, project);
      status = 'saved';
    } catch {
      status = 'error';
    }
  }
  function queueSave() {
    if (projectId) {
      if (!remoteReady) return;
      if (status === 'conflict' || status === 'expired') {
        persistAccountDraft();
        return;
      }
      status = 'pending';
      persistAccountDraft();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void sendRemote(), 500);
      return;
    }
    if (!allowSave) {
      status = 'blocked';
      return;
    }
    status = 'pending';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  function persistAccountDraft() {
    if (accountDraftCorrupt || !project || !accountKey || revision === null) return;
    try {
      const draft: AccountDraft = {
        baseRevision: revision,
        project,
        dirty: status !== 'saved',
        ...(retryRequest ? { pending: retryRequest } : {}),
      };
      saveAccountDraft(window.localStorage, accountKey, draft);
    } catch {
      status = 'error';
      announce(
        'Não foi possível guardar o rascunho desta conta neste navegador. Baixe uma cópia em JSON.',
        true,
      );
    }
  }
  async function sendRemote() {
    if (
      !project ||
      !projectId ||
      revision === null ||
      !remoteReady ||
      savingRemote ||
      writesBlocked(status)
    )
      return;
    const request = selectWriteRequest<CeremonyProject>(retryRequest, () => ({
      expectedRevision: revision!,
      operationId: crypto.randomUUID(),
      project: project!,
    }));
    retryRequest = request;
    persistAccountDraft();
    savingRemote = true;
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (response.status === 401) {
        status = 'expired';
        announce(
          'Sua sessão expirou. Entre novamente; o rascunho desta conta continua guardado neste navegador.',
          true,
        );
        return;
      }
      if (response.status === 409) {
        status = 'conflict';
        const remote = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          credentials: 'same-origin',
        });
        if (remote.ok) conflictSnapshot = projectSnapshotSchema.parse(await remote.json());
        announce(
          'Este projeto foi alterado em outro dispositivo. Suas mudanças locais estão preservadas.',
          true,
        );
        return;
      }
      if (!response.ok) throw new Error('Não foi possível sincronizar agora.');
      const saved = projectWriteResponseSchema.parse(await response.json());
      revision = saved.revision;
      retryRequest = null;
      const afterAck = stateAfterAcknowledgement(project, request.project, sameProject);
      status = afterAck;
      persistAccountDraft();
      if (afterAck === 'saved') {
        status = 'saved';
        announce('Projeto salvo na sua conta.');
      } else {
        status = 'pending';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => void sendRemote(), 0);
      }
    } catch {
      // Keep the exact operation and body for a safe retry after an ambiguous network result.
      status = 'error';
      persistAccountDraft();
      announce(
        'Não foi possível confirmar o salvamento. Tente novamente; a mesma alteração será reenviada com segurança.',
        true,
      );
    } finally {
      savingRemote = false;
    }
  }
  async function retryRemote() {
    if (!project) {
      await initializeEditor();
      return;
    }
    if (status === 'expired') {
      const destination = projectId
        ? `${resolve('/editor')}?project=${encodeURIComponent(projectId)}`
        : resolve('/projetos');
      window.location.assign(`${resolve('/conta')}?next=${encodeURIComponent(destination)}`);
      return;
    }
    if (status === 'conflict') return;
    status = 'pending';
    await sendRemote();
  }
  async function loadRemoteVersion() {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      announce('Não foi possível carregar a versão salva.', true);
      return;
    }
    const snapshot = projectSnapshotSchema.parse(await response.json());
    project = snapshot.project;
    revision = snapshot.revision;
    conflictSnapshot = null;
    retryRequest = null;
    past = [];
    future = [];
    status = 'saved';
    persistAccountDraft();
    announce('Versão salva carregada.');
  }
  function acceptRemoteOverAccountDraft() {
    if (!accountKey || !projectId) return;
    try {
      window.localStorage.removeItem(accountKey);
    } catch {
      /* The explicit replacement continues in memory. */
    }
    rawAccountDraft = null;
    accountDraftCorrupt = false;
    remoteReady = true;
    status = 'saved';
    persistAccountDraft();
    announce('Rascunho local substituído pela versão salva na conta.');
  }
  async function saveAsNewProject() {
    if (!project || !accountSession) return;
    const copy = { ...project, title: `${project.title} (cópia)`.slice(0, 120) };
    try {
      const id = crypto.randomUUID();
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, operationId: crypto.randomUUID(), project: copy }),
      });
      if (!response.ok) throw new Error('Não foi possível criar uma cópia. Tente novamente.');
      const snapshot = projectSnapshotSchema.parse(await response.json());
      window.location.assign(`${resolve('/editor')}?project=${encodeURIComponent(snapshot.id)}`);
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Não foi possível criar uma cópia.', true);
    }
  }
  async function initializeEditor() {
    const requestedId = new URL(window.location.href).searchParams.get('project');
    if (requestedId) {
      projectId = requestedId;
      try {
        accountSession = await readSession();
        if (!accountSession) {
          status = 'expired';
          announce('Entre na conta proprietária para abrir este projeto.', true);
          return;
        }
        const response = await fetch(`/api/projects/${encodeURIComponent(requestedId)}`, {
          credentials: 'same-origin',
        });
        if (response.status === 401) {
          status = 'expired';
          announce('Sua sessão expirou. Entre novamente para abrir o projeto.', true);
          return;
        }
        if (!response.ok)
          throw new Error(
            'Não foi possível abrir este projeto. Confira sua conta e tente novamente.',
          );
        const snapshot = projectSnapshotSchema.parse(await response.json());
        if (snapshot.id !== requestedId)
          throw new Error('A resposta não corresponde ao projeto solicitado.');
        revision = snapshot.revision;
        accountKey = accountDraftKey(accountSession.user.id, requestedId);
        let local: AccountDraft | null;
        try {
          local = loadAccountDraft(window.localStorage, accountKey);
        } catch {
          accountDraftCorrupt = true;
          try {
            rawAccountDraft = window.localStorage.getItem(accountKey);
          } catch {
            rawAccountDraft = null;
          }
          project = snapshot.project;
          status = 'blocked';
          announce(
            rawAccountDraft
              ? 'O rascunho local desta conta não pôde ser lido. Ele foi preservado para recuperação.'
              : 'O armazenamento local desta conta está indisponível. Nenhum salvamento remoto será feito até você escolher continuar.',
            true,
          );
          return;
        }
        project = snapshot.project;
        if (local?.pending) {
          retryRequest = local.pending;
          project = local.project;
          revision = local.baseRevision;
          status = 'pending';
        } else if (
          local &&
          local.dirty &&
          local.baseRevision === snapshot.revision &&
          !sameProject(local.project, snapshot.project)
        ) {
          project = local.project;
          status = 'pending';
          revision = local.baseRevision;
        } else if (
          local &&
          local.dirty &&
          local.baseRevision !== snapshot.revision &&
          !sameProject(local.project, snapshot.project)
        ) {
          project = local.project;
          status = 'conflict';
          revision = local.baseRevision;
          conflictSnapshot = snapshot;
          announce(
            'Há um rascunho local e uma versão salva mais recente. Escolha como continuar.',
            true,
          );
        } else {
          project = snapshot.project;
          revision = snapshot.revision;
          status = 'saved';
        }
        remoteReady = true;
        if (status === 'pending') queueSave();
      } catch (error) {
        status = accountSession ? 'error' : 'expired';
        announce(
          error instanceof Error ? error.message : 'Não foi possível abrir o projeto.',
          true,
        );
      }
      return;
    }
    try {
      const draft = loadDraft(window.localStorage);
      if (draft.status === 'ready') {
        project = draft.project;
        restored = true;
        status = 'saved';
      } else {
        project = createInitialProject();
        if (draft.status === 'corrupt') {
          rawDraft = draft.raw;
          allowSave = false;
          status = 'blocked';
        } else if (draft.status === 'unavailable') status = 'error';
        else saveNow();
      }
    } catch {
      project = createInitialProject();
      status = 'error';
    }
  }
  function cleanSelection() {
    if (selectedGuestId && !project?.guests.some((g) => g.id === selectedGuestId))
      selectedGuestId = null;
    if (
      selectedSeatId &&
      !project?.layout.rows.some(
        (r) => r.leftSeatIds.includes(selectedSeatId!) || r.rightSeatIds.includes(selectedSeatId!),
      )
    )
      selectedSeatId = null;
  }
  // Comparação barata: os comandos preservam referências do que não mudou, então convidados e
  // atribuições são comparados item a item por referência/campos, sem serializar o projeto todo.
  function sameItems<T extends object>(a: readonly T[], b: readonly T[]) {
    return (
      a === b ||
      (a.length === b.length &&
        a.every((item, index) => {
          const other = b[index]!;
          return (
            item === other ||
            Object.keys(item).every((key) => item[key as keyof T] === other[key as keyof T])
          );
        }))
    );
  }
  function sameProject(a: CeremonyProject, b: CeremonyProject) {
    return (
      a === b ||
      (a.title === b.title &&
        a.weddingDate === b.weddingDate &&
        a.couple.first === b.couple.first &&
        a.couple.second === b.couple.second &&
        (a.layout === b.layout || JSON.stringify(a.layout) === JSON.stringify(b.layout)) &&
        sameItems(a.guests, b.guests) &&
        sameItems(a.assignments, b.assignments))
    );
  }
  function recordFrame(start: number) {
    void tick().then(() =>
      requestAnimationFrame(() => {
        editTimes = [...editTimes.slice(-99), Number((performance.now() - start).toFixed(2))];
      }),
    );
  }
  function apply(next: CeremonyProject, text = '', start = performance.now()) {
    if (project) past = [...past.slice(-34), project];
    project = next;
    future = [];
    cleanSelection();
    queueSave();
    if (text) announce(text);
    recordFrame(start);
  }
  function ask(next: CeremonyProject, title: string, detail: string) {
    confirmation = { next, title, detail };
    void tick().then(() => confirmDialog.showModal());
  }
  function mutate(action: ProjectAction, text = '', protectPlaces = false): boolean {
    if (accountDraftCorrupt) {
      announce(
        'Baixe o rascunho preservado ou escolha explicitamente a versão da conta antes de editar.',
        true,
      );
      return false;
    }
    if (!project) return false;
    const start = performance.now();
    try {
      const next = action(project);
      if (sameProject(next, project)) return true;
      const stillSeated = new Set(next.assignments.map((b) => b.guestId));
      const displaced = project.assignments.filter((a) => !stillSeated.has(a.guestId)).length;
      if (protectPlaces && displaced) {
        ask(
          next,
          'Alterar os lugares ocupados?',
          `${displaced} ${displaced === 1 ? 'pessoa ficará' : 'pessoas ficarão'} sem cadeira. Todos os convidados continuam na lista e você pode desfazer a alteração.`,
        );
      } else apply(next, text, start);
      return true;
    } catch (error) {
      announce(
        error instanceof Error && !('issues' in error)
          ? error.message
          : 'Confira os dados: nomes, limites e lugares precisam ser válidos.',
        true,
      );
      return false;
    }
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous || !project) return;
    future = [...future.slice(-34), project];
    past = past.slice(0, -1);
    project = previous;
    cleanSelection();
    queueSave();
    announce('Última alteração desfeita.');
  }
  function redo() {
    const next = future.at(-1);
    if (!next || !project) return;
    past = [...past.slice(-34), project];
    future = future.slice(0, -1);
    project = next;
    cleanSelection();
    queueSave();
    announce('Alteração refeita.');
  }
  function selectSeat(id: string) {
    if (selectedGuestId) placeGuest(selectedGuestId, id);
    selectedSeatId = id;
    mobilePanel = 'guests';
  }
  function placeGuest(guestId: string, seatId: string) {
    if (
      mutate(
        (p) => assignGuest(p, guestId, seatId),
        'Lugar definido. Para mover, selecione a pessoa e toque em outra cadeira.',
      )
    ) {
      selectedGuestId = null;
      selectedSeatId = seatId;
    }
  }
  function selectGuest(id: string | null) {
    selectedGuestId = id;
    selectedSeatId = null;
    mobilePanel = 'guests';
  }
  function addPerson(guest: { id: string; name: string; category: GuestCategory; note: string }) {
    const ok = mutate(
      (p) => addGuest(p, guest),
      `${guest.name} adicionado. Agora escolha uma cadeira.`,
    );
    if (ok) selectGuest(guest.id);
    return ok;
  }
  function replaceProject(next: CeremonyProject, title: string) {
    if (accountDraftCorrupt) {
      announce(
        'Recupere o rascunho ou escolha a versão da conta antes de substituir o planejamento.',
        true,
      );
      return;
    }
    if (restored || past.length || project?.guests.length)
      ask(
        next,
        title,
        'O planejamento aberto será substituído neste navegador. Você pode baixar uma cópia em JSON antes. A alteração também pode ser desfeita.',
      );
    else {
      apply(next);
      announce('Planejamento aberto.');
    }
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('O arquivo deve ter até 2 MiB.');
      replaceProject(parseProjectFile(await file.text()).project, 'Abrir outro planejamento?');
    } catch (error) {
      announce(
        error instanceof Error && !('issues' in error)
          ? error.message
          : 'Arquivo inválido. Confira a versão e os lugares; o planejamento atual foi preservado.',
        true,
      );
    } finally {
      input.value = '';
    }
  }
  async function exportFile(kind: 'json' | 'full' | 'individual' | 'recovery') {
    if (!project || exporting) return;
    if (exportMenu) exportMenu.open = false;
    const snapshot = project,
      recipient = personalId;
    exporting = kind;
    try {
      const files = await import('../../lib/editor/files/images');
      if (kind === 'json') files.downloadProjectJson(snapshot);
      else if (kind === 'recovery' && (rawDraft || rawAccountDraft))
        files.downloadRawDraft(rawDraft ?? rawAccountDraft!);
      else if (kind === 'individual') {
        if (!recipient) throw new Error('Selecione uma pessoa com cadeira definida.');
        await files.downloadMapPng(snapshot, recipient);
      } else await files.downloadMapPng(snapshot);
      announce('Arquivo preparado para download.');
    } catch {
      announce(
        'Não foi possível gerar o arquivo. Tente novamente ou salve uma cópia em JSON.',
        true,
      );
    } finally {
      exporting = null;
    }
  }
  function keyboard(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') || confirmDialog?.open)
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if (event.key === 'Escape') {
      selectedGuestId = null;
      selectedSeatId = null;
    }
  }
  function storageChanged(event: StorageEvent) {
    if (!projectId || !accountSession || !event.key) return;
    const userId = accountSession.user.id;
    const draftRemoved =
      event.key.startsWith(`enlace:draft:account:v1:${userId}:`) && event.newValue === null;
    const loggedOut = event.key === `enlace:account-logout:v1:${userId}` && event.newValue !== null;
    if (draftRemoved || loggedOut) {
      clearTimeout(saveTimer);
      project = null;
      accountSession = null;
      revision = null;
      accountKey = null;
      retryRequest = null;
      conflictSnapshot = null;
      remoteReady = false;
      status = 'expired';
      announce(
        'A sessão desta conta foi encerrada em outra aba. Entre novamente para continuar.',
        true,
      );
    }
  }
  onMount(() => {
    void initializeEditor();
    if (matchMedia('(max-width: 900px)').matches) zoom = 1;
    window.addEventListener('keydown', keyboard);
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('storage', storageChanged);
    return () => {
      clearTimeout(saveTimer);
      saveNow();
      window.removeEventListener('keydown', keyboard);
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('storage', storageChanged);
    };
  });
</script>

<svelte:head
  ><title>{project?.title ?? 'Planejador da cerimônia'} · Enlace</title><meta
    name="description"
    content="Organize a planta e os lugares dos convidados da sua cerimônia."
  /></svelte:head
>

<div class="editor-page">
  <header class="editor-header">
    <a href={resolve('/')} class="editor-brand" aria-label="Enlace, voltar à página inicial"
      ><svg viewBox="0 0 36 36" aria-hidden="true"
        ><ellipse cx="14" cy="18" rx="8" ry="11" /><ellipse cx="23" cy="18" rx="8" ry="11" /></svg
      ><span>enlace</span></a
    >
    <div class="project-heading">
      <h1>{project?.title ?? 'Preparando seu espaço…'}</h1>
      <span
        class:error={status === 'error' ||
          status === 'blocked' ||
          status === 'conflict' ||
          status === 'expired'}
        class="save-state"
        role="status"
        >{status === 'saved'
          ? projectId
            ? 'Salvo na sua conta'
            : 'Rascunho salvo neste navegador'
          : status === 'pending'
            ? projectId
              ? 'Sincronizando…'
              : 'Salvando neste navegador…'
            : status === 'blocked'
              ? 'Rascunho anterior protegido'
              : status === 'conflict'
                ? 'Conflito de versões'
                : status === 'expired'
                  ? 'Sessão encerrada'
                  : projectId
                    ? project
                      ? 'Não foi possível sincronizar'
                      : 'Projeto indisponível'
                    : 'Não foi possível salvar neste navegador'}</span
      >
    </div>
    <nav class="account-tools" aria-label="Conta e projetos">
      {#if projectId}<a href={resolve('/projetos')}>Meus projetos</a>{:else}<a
          href={resolve('/conta')}>Entrar e salvar na conta</a
        >{/if}
    </nav>
    <div class="header-tools">
      <div class="history-tools">
        <button
          aria-label="Desfazer última alteração"
          title="Desfazer (Ctrl+Z)"
          disabled={!past.length}
          onclick={undo}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12" /></svg
          ></button
        ><button
          aria-label="Refazer alteração"
          title="Refazer (Ctrl+Shift+Z)"
          disabled={!future.length}
          onclick={redo}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" /></svg
          ></button
        >
      </div>
      <button class="editor-button" onclick={() => fileInput.click()} disabled={!project}
        >Abrir JSON</button
      >
      <details class="export-menu" bind:this={exportMenu}>
        <summary
          >Exportar <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg
          ></summary
        >
        <div>
          <button disabled={!project || Boolean(exporting)} onclick={() => exportFile('json')}
            >Projeto em JSON</button
          >
          <button disabled={!project || Boolean(exporting)} onclick={() => exportFile('full')}
            >Planta completa em PNG</button
          >
          <button
            disabled={!canExportPersonal || Boolean(exporting)}
            onclick={() => exportFile('individual')}>Mapa individual em PNG</button
          >
          <button disabled={!project} onclick={() => window.print()}>Imprimir planta</button>
        </div>
      </details>
    </div>
    <input
      type="file"
      bind:this={fileInput}
      accept=".json,application/json"
      onchange={importFile}
      aria-label="Abrir planejamento JSON"
      hidden
    />
  </header>

  {#if rawDraft}
    <div class="recovery-banner" role="alert">
      <p>
        O rascunho anterior não pôde ser lido e está preservado. Baixe uma cópia antes de permitir
        um novo salvamento.
      </p>
      {#if status === 'conflict' && conflictSnapshot}<p class="conflict-date">
          Versão salva em {new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(conflictSnapshot.updatedAt))}.
        </p>{/if}
      <button onclick={() => exportFile('recovery')}>Baixar para recuperação</button><button
        onclick={() => {
          if (project) {
            confirmation = {
              next: project,
              title: 'Substituir o rascunho anterior?',
              detail:
                'O conteúdo anterior será substituído pelo planejamento aberto. Baixe a cópia para recuperação antes de continuar.',
              replaceCorrupt: true,
            };
            void tick().then(() => confirmDialog.showModal());
          }
        }}>Permitir novo salvamento</button
      >
    </div>
  {:else if status === 'error' && !projectId}
    <div class="recovery-banner" role="alert">
      <p>Suas alterações estão apenas nesta sessão. Baixe o JSON para guardar uma cópia.</p>
      <button onclick={saveNow}>Tentar salvar novamente</button><button
        onclick={() => exportFile('json')}>Baixar JSON</button
      >
    </div>
  {/if}

  {#if rawAccountDraft}
    <div class="recovery-banner" role="alert">
      <p>
        O rascunho desta conta não pôde ser validado e continua intacto. Baixe uma cópia antes de
        decidir usar a versão salva na conta.
      </p>
      <button onclick={() => exportFile('recovery')}>Baixar rascunho para recuperação</button>
      <button onclick={acceptRemoteOverAccountDraft}
        >Usar versão salva na conta e substituir este rascunho</button
      >
    </div>
  {/if}

  {#if project && projectId && (status === 'error' || status === 'conflict' || status === 'expired')}
    <div class="recovery-banner" role="alert">
      <p>
        {status === 'conflict'
          ? 'O rascunho local foi preservado. Carregar a versão salva descarta as mudanças locais; criar uma cópia mantém seu trabalho.'
          : status === 'expired'
            ? 'O rascunho local desta conta está guardado neste navegador. Entre novamente para retomar a sincronização.'
            : 'As mudanças seguem no rascunho local desta conta e ainda não foram confirmadas pelo servidor.'}
      </p>
      {#if status === 'conflict'}<button onclick={loadRemoteVersion}>Carregar versão salva</button
        ><button onclick={saveAsNewProject}>Salvar como novo projeto</button>
      {:else}<button onclick={retryRemote}
          >{status === 'expired' ? 'Entrar novamente' : 'Tentar sincronizar'}</button
        >{/if}
      <button onclick={() => exportFile('json')}>Baixar JSON</button>
    </div>
  {/if}

  {#if project && geometry}
    <div class="editor-workspace">
      <aside
        class:mobile-hidden={mobilePanel !== 'structure'}
        class="structure-sidebar"
        aria-label="Configurar planta"
      >
        <StructurePanel
          {project}
          onLayoutChange={(patch) => mutate((p) => setLayout(p, patch))}
          onRowCount={(id, side, count) =>
            mutate(
              (p) => setRowCount(p, id, side, count),
              'Quantidade de cadeiras atualizada.',
              true,
            )}
          onAddRow={() => mutate(addRow, 'Nova fileira adicionada.')}
          onRemoveRow={(id) => mutate((p) => removeRow(p, id), 'Fileira removida.', true)}
          onDetailsChange={(patch) =>
            mutate((p) => setProjectDetails(p, patch), 'Detalhes atualizados.')}
        />
        <div class="project-actions">
          <button
            onclick={() => replaceProject(createSampleProject(), 'Explorar um exemplo fictício?')}
            >Explorar exemplo com convidados</button
          ><button
            onclick={() => replaceProject(createInitialProject(), 'Começar um novo planejamento?')}
            >Novo planejamento</button
          >
          <p>
            {projectId
              ? 'O projeto sincroniza com sua conta após cada alteração.'
              : 'O rascunho fica neste navegador. Entre na conta para criar um projeto sincronizado.'}
          </p>
        </div>
      </aside>

      <main
        class="plan-workspace"
        aria-label="Planta da cerimônia"
        data-edit-times={JSON.stringify(editTimes)}
      >
        <div class="plan-toolbar">
          <div>
            <h2>O cenário do seu sim</h2>
            <p>
              {project.couple.first || project.couple.second
                ? [project.couple.first, project.couple.second].filter(Boolean).join(' & ')
                : 'Seu planejamento, lugar por lugar.'}
            </p>
          </div>
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
        <div class="plan-stats">
          <span><strong>{total}</strong> cadeiras</span><span
            ><strong>{assigned}</strong> pessoas posicionadas</span
          ><span><strong>{total - assigned}</strong> lugares livres</span>
        </div>
        <PlanCanvas
          {project}
          {geometry}
          {selectedGuestId}
          {selectedSeatId}
          {zoom}
          onSeatSelect={selectSeat}
          onGuestDrop={placeGuest}
        />
        <div class="map-context">
          <div>
            <span class="context-mark"></span>
            <p>
              {selectedGuestId
                ? `Escolha uma cadeira para ${project.guests.find((g) => g.id === selectedGuestId)?.name}.`
                : selectedSeatId
                  ? getSeatLabel(project, selectedSeatId)
                  : 'Selecione uma pessoa e toque na cadeira dela.'}
            </p>
          </div>
          <span class="keyboard-note">Setas navegam · Enter seleciona</span>
        </div>
        <div class="map-legend">
          {#each ['familia', 'padrinho', 'pajem', 'convidado'] as category (category)}<span
              ><i
                style:background={GUEST_CATEGORIES[category as GuestCategory].fill}
                style:border-color={GUEST_CATEGORIES[category as GuestCategory].stroke}
              ></i>{category === 'padrinho'
                ? 'Padrinhos'
                : GUEST_CATEGORIES[category as GuestCategory].label}</span
            >{/each}<span class="map-orientation">Da entrada, olhando para o altar.</span>
        </div>
        {#if canExportPersonal}<div class="personal-map">
            <span>Orientação para {personalGuest?.name}</span><button
              disabled={Boolean(exporting)}
              onclick={() => exportFile('individual')}>Baixar mapa individual</button
            >
          </div>{/if}
      </main>

      <nav class="mobile-tabs" aria-label="Ferramentas do planejamento">
        <button
          aria-pressed={mobilePanel === 'structure'}
          onclick={() => (mobilePanel = 'structure')}>Estrutura</button
        ><button aria-pressed={mobilePanel === 'guests'} onclick={() => (mobilePanel = 'guests')}
          >Pessoas <span>{project.guests.length}</span></button
        >
      </nav>

      <aside
        class:mobile-hidden={mobilePanel !== 'guests'}
        class="guests-sidebar"
        aria-label="Convidados e lugares"
      >
        <GuestsPanel
          {project}
          {selectedGuestId}
          {selectedSeatId}
          onSelectGuest={selectGuest}
          onAddGuest={addPerson}
          onUpdateGuest={(id, patch) =>
            mutate((p) => updateGuest(p, id, patch), 'Convidado atualizado.')}
          onRemoveGuest={(id) => mutate((p) => removeGuest(p, id), 'Convidado removido.')}
          onAssignGuest={placeGuest}
          onUnassignSeat={(id) =>
            mutate((p) => unassignSeat(p, id), 'Lugar liberado. O convidado continua na lista.')}
        />
      </aside>
    </div>
  {:else if projectId && (status === 'error' || status === 'expired')}<main class="loading-editor">
      <h1>{status === 'expired' ? 'Entre para abrir este projeto' : 'Projeto indisponível'}</h1>
      <p>
        {status === 'expired'
          ? 'Este projeto pertence a uma conta. Entre com a conta proprietária para continuar.'
          : 'Ele pode ter sido excluído, pertencer a outra conta ou o servidor pode estar indisponível.'}
      </p>
      <p>
        {#if status === 'expired'}<a href={resolve('/conta')}>Entrar</a>{:else}<a
            href={resolve('/projetos')}>Voltar para meus projetos</a
          >{/if}
      </p>
    </main>
  {:else}<main class="loading-editor">
      <h1>Preparando seu espaço…</h1>
      <p>Carregando o planejamento deste navegador.</p>
    </main>{/if}

  <div class:error={feedbackError} class="editor-feedback" role="status" aria-live="polite">
    {exporting ? 'Preparando seu arquivo…' : feedback}
  </div>
  <dialog
    bind:this={confirmDialog}
    onclose={() => (confirmation = null)}
    oncancel={() => (confirmation = null)}
    aria-labelledby="confirm-heading"
  >
    {#if confirmation}<h2 id="confirm-heading">{confirmation.title}</h2>
      <p>{confirmation.detail}</p>
      <div>
        <button class="editor-button" onclick={() => confirmDialog.close()}>Cancelar</button><button
          class="editor-button primary"
          onclick={() => {
            if (!confirmation) return;
            const next = confirmation.next;
            if (confirmation.replaceCorrupt) {
              rawDraft = null;
              allowSave = true;
            }
            apply(next, 'Planejamento atualizado. Você pode desfazer esta ação.');
            restored = false;
            selectedGuestId = null;
            selectedSeatId = null;
            confirmDialog.close();
          }}>Continuar</button
        >
      </div>{/if}
  </dialog>
</div>

<style>
  .editor-page {
    --editor-green: #295842;
    --editor-bg: #fffefb;
    --editor-line: #dfe3da;
    color: #27342c;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    font-size: 13px;
  }
  .editor-header {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 16px 25px;
    background: #fffefb;
    border-bottom: 1px solid #dfe3da;
    flex-shrink: 0;
  }
  .editor-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .editor-brand svg {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: #295842;
    stroke-width: 1.6;
  }
  .editor-brand svg ellipse:last-child {
    stroke: #b89364;
  }
  .editor-brand span {
    font:
      30px Georgia,
      serif;
    letter-spacing: -0.03em;
  }
  .project-heading {
    min-width: 0;
    flex: 1;
  }
  .project-heading h1 {
    font:
      600 14px/1.3 'Segoe UI',
      sans-serif;
    letter-spacing: 0;
    margin: 0 0 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .save-state {
    color: #536b55;
    font-size: 11px;
  }
  .save-state.error {
    color: #923d35;
  }
  .header-tools,
  .history-tools,
  .zoom-tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .history-tools {
    padding-right: 9px;
    border-right: 1px solid #dfe3da;
  }
  button,
  summary {
    font: inherit;
  }
  button {
    min-height: 34px;
  }
  .history-tools button,
  .zoom-tools button {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: #3e5f47;
    border-radius: 6px;
    min-width: 32px;
    padding: 6px;
  }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .editor-button,
  .export-menu summary {
    padding: 9px 13px;
    border: 1px solid #c4d0c0;
    background: transparent;
    color: #295842;
    font-weight: 600;
    font-size: 12px;
    border-radius: 8px;
  }
  .export-menu {
    position: relative;
  }
  .export-menu summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    background: #295842;
    color: #fffefb;
    border-color: #295842;
  }
  .export-menu summary::-webkit-details-marker {
    display: none;
  }
  .export-menu summary svg {
    width: 14px;
    height: 14px;
  }
  .export-menu > div {
    position: absolute;
    top: calc(100% + 9px);
    right: 0;
    z-index: 60;
    min-width: 235px;
    padding: 7px;
    background: #fffefb;
    border: 1px solid #ccd7c7;
    border-radius: 10px;
  }
  .export-menu button {
    display: block;
    width: 100%;
    padding: 11px;
    text-align: left;
    border: 0;
    background: transparent;
    border-radius: 6px;
    color: #294c34;
    font-size: 12px;
  }
  button:hover:not(:disabled) {
    background: #eaf1e9;
  }
  .editor-button.primary {
    background: #295842;
    color: white;
  }
  .editor-workspace {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr) 292px;
  }
  .structure-sidebar,
  .guests-sidebar {
    overflow-y: auto;
    min-height: 0;
    background: #f7f8f3;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .structure-sidebar {
    padding: 23px 19px;
    border-right: 1px solid #dfe3da;
  }
  .guests-sidebar {
    padding: 23px 19px;
    border-left: 1px solid #dfe3da;
  }
  .plan-workspace {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fffefb;
    margin: 18px;
    border: 1px solid #dfe3da;
    border-radius: 12px;
    overflow: hidden;
  }
  .plan-toolbar {
    padding: 19px 22px 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .plan-toolbar h2 {
    font:
      400 23px/1.2 Georgia,
      serif;
    margin: 0 0 5px;
    letter-spacing: -0.025em;
  }
  .plan-toolbar p {
    color: #626e63;
    font-size: 11px;
    margin: 0;
  }
  .zoom-tools {
    gap: 0;
    border: 1px solid #dfe3da;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .zoom-tools button {
    font-size: 10px;
    min-height: 32px;
  }
  .plan-stats {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    padding: 0 22px 13px;
    color: #626e63;
    font-size: 10px;
    border-bottom: 1px solid #eef0e9;
  }
  .plan-stats strong {
    font-weight: 650;
    color: #295842;
    font-variant-numeric: tabular-nums;
  }
  .map-context {
    padding: 13px 19px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #f3f6ee;
    border-top: 1px solid #e3e9dd;
  }
  .map-context > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .context-mark {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #72977d;
    flex-shrink: 0;
  }
  .map-context p {
    margin: 0;
    font-size: 11px;
    color: #36543d;
    line-height: 1.6;
  }
  .keyboard-note {
    font-size: 9px;
    color: #626e63;
    white-space: nowrap;
  }
  .map-legend {
    padding: 12px 19px;
    display: flex;
    align-items: center;
    gap: 11px;
    flex-wrap: wrap;
    font-size: 9px;
    color: #626e63;
  }
  .map-legend span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .map-legend i {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    border: 1px solid;
  }
  .map-orientation {
    margin-left: auto;
  }
  .personal-map {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #faf4e8;
    padding: 10px 18px;
    font-size: 11px;
    color: #70552f;
  }
  .personal-map button {
    border: 0;
    background: transparent;
    color: #70552f;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 11px;
  }
  .project-actions {
    margin-top: 24px;
    border-top: 1px solid #dfe3da;
    padding-top: 14px;
  }
  .project-actions button {
    display: block;
    background: none;
    border: 0;
    color: #49644b;
    font-size: 11px;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-align: left;
    padding: 4px 0;
  }
  .project-actions p {
    font-size: 10px;
    color: #626e63;
    line-height: 1.6;
  }
  .mobile-tabs {
    display: none;
  }
  .editor-feedback {
    background: #fffefb;
    border-top: 1px solid #dfe3da;
    min-height: 26px;
    font-size: 11px;
    color: #36543d;
    padding: 5px 24px;
    flex-shrink: 0;
  }
  .editor-feedback:empty {
    padding: 0;
    min-height: 0;
    border: 0;
  }
  .editor-feedback.error {
    color: #923d35;
    background: #fff5ef;
  }
  .recovery-banner {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    padding: 10px 24px;
    background: #fcf0dd;
    border-bottom: 1px solid #ddcaa7;
    font-size: 11px;
    color: #75532e;
  }
  .recovery-banner p {
    margin: 0;
    flex: 1;
  }
  .recovery-banner button {
    background: transparent;
    border: 1px solid #c7ab7b;
    border-radius: 6px;
    color: #75532e;
    padding: 6px 10px;
    font-size: 11px;
  }
  dialog {
    border: 1px solid #d4ddcd;
    padding: 28px;
    border-radius: 14px;
    max-width: min(460px, calc(100vw - 32px));
    background: #fffefb;
    color: #27342c;
  }
  dialog::backdrop {
    background: rgb(25 45 31 / 0.4);
  }
  dialog h2 {
    font:
      400 25px Georgia,
      serif;
    margin: 0 0 12px;
  }
  dialog p {
    font-size: 13px;
    line-height: 1.8;
    color: #536354;
  }
  dialog > div {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 22px;
  }
  .loading-editor {
    margin: 80px auto;
    padding: 24px;
  }
  .loading-editor h1 {
    font:
      28px Georgia,
      serif;
  }
  @media (max-width: 1200px) {
    .editor-workspace {
      grid-template-columns: 240px minmax(0, 1fr) 260px;
    }
    .structure-sidebar,
    .guests-sidebar {
      padding-inline: 14px;
    }
    .plan-workspace {
      margin: 12px;
    }
    .keyboard-note {
      display: none;
    }
    .plan-toolbar {
      padding-inline: 16px;
    }
    .plan-toolbar h2 {
      font-size: 20px;
    }
  }
  @media (max-width: 980px) {
    .editor-page {
      height: auto;
      min-height: 100dvh;
    }
    .editor-header {
      position: sticky;
      top: 0;
      z-index: 50;
      flex-wrap: wrap;
      padding: 12px 16px;
      gap: 10px 18px;
    }
    .project-heading {
      min-width: 150px;
    }
    .editor-brand span {
      font-size: 26px;
    }
    .editor-brand svg {
      width: 27px;
    }
    .header-tools {
      margin-left: auto;
    }
    .editor-workspace {
      display: flex;
      flex-direction: column;
    }
    .plan-workspace {
      order: 0;
      position: relative;
      top: auto;
      height: min(52dvh, 470px);
      min-height: 320px;
      margin: 12px 12px 0;
    }
    .plan-toolbar {
      padding-block: 12px 8px;
    }
    .plan-stats {
      gap: 14px;
      padding: 0 16px 8px;
    }
    .map-context {
      padding: 9px 13px;
    }
    .map-legend {
      padding: 9px 13px;
      gap: 8px;
    }
    .map-orientation {
      display: none !important;
    }
    .mobile-tabs {
      display: flex;
      order: 1;
      margin: 13px 16px 0;
      border-bottom: 1px solid #cbd7c6;
    }
    .mobile-tabs button {
      flex: 1;
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      padding: 12px;
      color: #626e63;
    }
    .mobile-tabs button[aria-pressed='true'] {
      color: #295842;
      border-color: #295842;
      font-weight: 650;
    }
    .mobile-tabs span {
      margin-left: 5px;
      font-size: 10px;
    }
    .structure-sidebar,
    .guests-sidebar {
      order: 2;
      overflow: visible;
      padding: 24px;
      border: 0;
    }
    .mobile-hidden {
      display: none;
    }
    .editor-feedback {
      position: sticky;
      bottom: 0;
      z-index: 30;
      padding-inline: 16px;
    }
  }
  @media (max-width: 540px) {
    .editor-header {
      gap: 10px;
      padding: 10px 14px;
    }
    .project-heading {
      min-width: 0;
    }
    .project-heading h1 {
      font-size: 12px;
    }
    .save-state {
      font-size: 9px;
    }
    .header-tools {
      width: 100%;
      justify-content: flex-end;
    }
    .history-tools {
      margin-right: auto;
    }
    .plan-workspace {
      min-height: 300px;
      height: 46dvh;
    }
    .plan-toolbar h2 {
      font-size: 20px;
    }
    .plan-toolbar p {
      font-size: 10px;
    }
    .plan-stats {
      gap: 11px;
      font-size: 9px;
    }
    .map-legend {
      font-size: 8px;
    }
    .personal-map {
      padding: 7px 12px;
      flex-wrap: wrap;
      gap: 4px;
    }
    .structure-sidebar,
    .guests-sidebar {
      padding: 21px 18px;
    }
  }
  @media print {
    .editor-page {
      display: block;
      height: auto;
      background: white;
    }
    .editor-header {
      position: static;
      border: 0;
    }
    .save-state,
    .header-tools,
    .structure-sidebar,
    .guests-sidebar,
    .mobile-tabs,
    .map-context,
    .map-legend,
    .personal-map,
    .zoom-tools,
    .editor-feedback,
    .recovery-banner {
      display: none !important;
    }
    .editor-workspace {
      display: block;
    }
    .plan-workspace {
      margin: 0;
      position: static;
      display: block;
      height: auto;
      border: 0;
    }
    .plan-toolbar {
      padding: 0 0 8px;
    }
    .plan-stats {
      border: 0;
    }
    :global(body) {
      overflow: visible;
    }
    @page {
      size: A4 landscape;
      margin: 11mm;
    }
  }
</style>
