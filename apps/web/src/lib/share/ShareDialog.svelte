<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { MAX_ACTIVE_SHARE_LINKS, type ShareLink, type ShareLinkMode } from '@enlace/contracts';
  import {
    createShareLink,
    EXPIRY_OPTIONS,
    listShareLinks,
    revokeShareLink,
    ShareError,
    shareUrl,
  } from './client';

  // Painel de links de visualização (ADR-0014), carregado sob demanda pelo editor e por /projetos.
  let {
    projectId,
    projectTitle,
    onClose,
  }: { projectId: string; projectTitle: string; onClose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let labelInput = $state<HTMLInputElement>();
  let links = $state<ShareLink[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let label = $state('');
  let mode = $state<ShareLinkMode>('names');
  let expiry = $state<(typeof EXPIRY_OPTIONS)[number]['value']>(30);
  let confirmRevoke = $state<string | null>(null);
  let copiedId = $state<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const full = $derived(links.length >= MAX_ACTIVE_SHARE_LINKS);
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

  const urlOf = (link: ShareLink) => shareUrl(location.origin, link.token);
  const message = (cause: unknown) =>
    cause instanceof ShareError ? cause.message : 'Não foi possível concluir. Tente novamente.';

  async function refresh() {
    loading = true;
    error = '';
    try {
      links = await listShareLinks(projectId);
    } catch (cause) {
      error = message(cause);
    } finally {
      loading = false;
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy || full || !label.trim()) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const link = await createShareLink(projectId, {
        label: label.trim(),
        mode,
        expiresInDays: expiry,
      });
      links = [...links, link];
      label = '';
      notice = `Link "${link.label}" criado. Copie e envie para quem vai ver.`;
      await tick();
      document.getElementById(`copy-${link.id}`)?.focus();
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = false;
    }
  }

  async function copy(link: ShareLink) {
    error = '';
    try {
      await navigator.clipboard.writeText(urlOf(link));
      copiedId = link.id;
      notice = `Link "${link.label}" copiado.`;
    } catch {
      // Sem permissão de área de transferência: o campo ao lado fica selecionado para copiar à mão.
      const field = document.getElementById(`url-${link.id}`) as HTMLInputElement | null;
      field?.focus();
      field?.select();
      notice = 'Selecionamos o link. Use Ctrl+C ou "Copiar" do aparelho.';
    }
  }

  async function share(link: ShareLink) {
    try {
      await navigator.share({ title: projectTitle, url: urlOf(link) });
    } catch {
      // Cancelar a folha de compartilhamento do aparelho não é erro.
    }
  }

  async function revoke(link: ShareLink) {
    if (confirmRevoke !== link.id) {
      confirmRevoke = link.id;
      return;
    }
    busy = true;
    error = '';
    try {
      await revokeShareLink(projectId, link.id);
      links = links.filter((item) => item.id !== link.id);
      confirmRevoke = null;
      notice = `Link "${link.label}" desativado. Quem tiver esse link não consegue mais abrir.`;
    } catch (cause) {
      error = message(cause);
    } finally {
      busy = false;
    }
  }

  function expiryText(link: ShareLink): string {
    return link.expiresAt ? `Vale até ${dateFormat.format(new Date(link.expiresAt))}` : 'Sem prazo';
  }

  onMount(() => {
    dialog.showModal();
    void refresh();
    void tick().then(() => labelInput?.focus());
  });
</script>

<dialog
  bind:this={dialog}
  class="share-dialog"
  aria-labelledby="share-title"
  aria-describedby="share-intro"
  onclose={onClose}
  oncancel={(event) => {
    if (busy) event.preventDefault();
  }}
>
  <h2 id="share-title">Compartilhar planta</h2>
  <p class="lead" id="share-intro">
    Quem receber o link vê a planta no celular ou no computador, sem conta e sem poder editar. O
    link mostra sempre a última versão salva.
  </p>

  <form class="create" onsubmit={create}>
    <label class="field"
      >Nome do link <span>para você saber para quem enviou</span>
      <input
        bind:this={labelInput}
        bind:value={label}
        maxlength="60"
        required
        placeholder="Ex.: Família, Cerimonialista"
        disabled={busy || full}
      /></label
    >

    <fieldset>
      <legend>O que aparece</legend>
      <label class="choice"
        ><input type="radio" name="share-mode" value="names" bind:group={mode} disabled={busy} />
        <span
          ><strong>Com nomes</strong> Planta, nome de cada pessoa na cadeira, categorias e a busca "Encontre
          seu lugar".</span
        ></label
      >
      <label class="choice"
        ><input type="radio" name="share-mode" value="plan" bind:group={mode} disabled={busy} />
        <span
          ><strong>Só a planta</strong> Cadeiras ocupadas e livres, sem nenhum dado de convidado.</span
        ></label
      >
    </fieldset>
    {#if mode === 'names'}
      <p class="warn">
        Qualquer pessoa com este link verá os nomes dos convidados, e o link pode ser repassado. As
        observações nunca aparecem.
      </p>
    {/if}

    <label class="field"
      >Validade
      <select bind:value={expiry} disabled={busy}>
        {#each EXPIRY_OPTIONS as option (option.label)}<option value={option.value}
            >{option.label}</option
          >{/each}
      </select></label
    >

    <button class="primary" type="submit" disabled={busy || full || !label.trim()}
      >{busy ? 'Criando…' : 'Criar link'}</button
    >
    {#if full}<p class="hint">
        Limite de {MAX_ACTIVE_SHARE_LINKS} links ativos. Desative um para criar outro.
      </p>{/if}
  </form>

  <p class="status" role="status">{notice}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <section aria-labelledby="share-links-title">
    <h3 id="share-links-title">
      Links ativos <small>{links.length} de {MAX_ACTIVE_SHARE_LINKS}</small>
    </h3>
    {#if loading}
      <p class="hint">Carregando links…</p>
    {:else if links.length === 0}
      <p class="hint">Nenhum link ativo. Crie o primeiro acima.</p>
    {:else}
      <ul class="links">
        {#each links as link (link.id)}
          <li>
            <div class="link-copy">
              <strong>{link.label}</strong>
              <span
                >{link.mode === 'names' ? 'Com nomes' : 'Só a planta'} · {expiryText(link)} · criado em
                {dateFormat.format(new Date(link.createdAt))}</span
              >
              <label class="sr-only" for={`url-${link.id}`}>Endereço do link {link.label}</label>
              <input id={`url-${link.id}`} class="url" readonly value={urlOf(link)} />
            </div>
            <div class="link-actions">
              <button id={`copy-${link.id}`} type="button" onclick={() => copy(link)}
                >{copiedId === link.id ? 'Copiado' : 'Copiar link'}</button
              >
              {#if canShare}<button type="button" onclick={() => share(link)}>Enviar…</button>{/if}
              <button
                type="button"
                class="revoke"
                disabled={busy}
                aria-describedby={confirmRevoke === link.id ? `revoke-${link.id}` : undefined}
                onclick={() => revoke(link)}
                >{confirmRevoke === link.id ? 'Confirmar desativação' : 'Desativar'}</button
              >
              {#if confirmRevoke === link.id}
                <span class="revoke-note" id={`revoke-${link.id}`}
                  >Quem tem este link deixa de conseguir abrir.</span
                >
                <button type="button" onclick={() => (confirmRevoke = null)}>Manter</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <div class="actions">
    <button type="button" onclick={() => dialog.close()} disabled={busy}>Fechar</button>
  </div>
</dialog>

<style>
  .share-dialog {
    border: 1px solid #d4ddcd;
    padding: 26px;
    border-radius: 14px;
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: #fffefb;
    color: #27342c;
    font-size: 13px;
  }
  .share-dialog::backdrop {
    background: rgb(25 45 31 / 0.4);
  }
  h2 {
    margin: 0 0 8px;
    font:
      400 25px Georgia,
      serif;
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 14px;
  }
  h3 small {
    color: var(--muted);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .lead,
  .hint {
    margin: 0 0 12px;
    color: #536354;
    line-height: 1.6;
  }
  .create {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .field {
    display: grid;
    gap: 4px;
    font-weight: 600;
  }
  .field span {
    color: var(--muted);
    font-weight: 400;
  }
  .field input,
  .field select,
  .url {
    min-height: 42px;
    padding: 8px 10px;
    border: 1px solid var(--field-line);
    border-radius: 7px;
    background: #fff;
    color: inherit;
    font: inherit;
  }
  fieldset {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 4px;
    font-weight: 600;
  }
  .choice {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: start;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    line-height: 1.5;
    cursor: pointer;
  }
  .choice:has(input:checked) {
    border-color: var(--green);
    background: #f1f6ef;
  }
  .choice input {
    width: 18px;
    height: 18px;
    margin: 2px 0 0;
    accent-color: var(--green);
  }
  .choice strong {
    display: block;
  }
  .warn {
    margin: 0;
    padding: 9px 12px;
    border-radius: 8px;
    background: #fbf7ec;
    color: #6b4f12;
    line-height: 1.5;
  }
  .status:empty {
    display: none;
  }
  .status {
    margin: 12px 0 0;
    color: var(--green);
  }
  .error {
    margin: 10px 0 0;
    padding: 9px 12px;
    border-radius: 8px;
    background: #fdf1ee;
    color: #8a2a1b;
  }
  .links {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .links li {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .link-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .link-copy strong {
    overflow-wrap: anywhere;
  }
  .link-copy span {
    color: var(--muted);
  }
  .url {
    width: 100%;
    margin-top: 4px;
    color: #536354;
    font-size: 12px;
  }
  .link-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  button {
    min-height: 40px;
    padding: 8px 13px;
    border: 1px solid #c4d0c0;
    border-radius: 8px;
    background: transparent;
    color: var(--green);
    font-weight: 600;
  }
  .primary {
    justify-self: start;
    border-color: var(--green);
    background: var(--green);
    color: #fff;
  }
  .revoke {
    border-color: #d9b4ad;
    color: #8a2a1b;
  }
  .revoke-note {
    color: #8a2a1b;
    font-size: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .share-dialog :focus-visible {
    outline: 3px solid #5f825f;
    outline-offset: 2px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    .share-dialog {
      width: calc(100vw - 16px);
      max-width: none;
      max-height: calc(100dvh - 16px);
      padding: 16px;
    }
    .link-actions button {
      flex: 1 1 auto;
    }
  }
</style>
