# Memória do projeto — Enlace

Atualizado em 21/11/2026, America/Sao_Paulo.

## Colaboração e cópia entre contas — 21/11/2026

Entrega concluída localmente na branch `carrijoga/link-compartilhamento-somente`, estendendo o compartilhamento (ADR-0014) com os dois modos autenticados de participação registrados no ADR-0016 (`docs/decisoes/0016-compartilhamento-colaborativo-e-copia.md`):
- **Contratos e domínio**: `role: 'owner' | 'editor'` em `ProjectSummary` e `ProjectSnapshot`; `shareLinkModeSchema` com `'names' | 'plan' | 'edit' | 'clone'`; `redeemShareLinkRequestSchema` (`{ token, mode: 'edit' | 'clone' }`) e `redeemShareLinkResponseSchema` (`{ projectId }`).
- **Banco e migração**: `0003_project_link_redemptions.sql` (`project_link_editors` e `project_link_clone_receipts` + constraint `project_share_links_mode_check` ampliada). Script `db:generate` em `apps/api/package.json` apontado para `../../node_modules/drizzle-kit/bin.cjs` (compatível com `nodeLinker: hoisted`).
- **API e concorrência**: `POST /api/shared/redeem` (autenticado, liberado no proxy `/api/[...path]`); `store.list` e `store.get` retornam projetos próprios (`owner`) e compartilhados com link `'edit'` ativo (`editor`); `store.save` revalida a permissão após `FOR UPDATE` na linha do projeto e escopa `operationId` por `(project_id, actor_id, operation_id)`; `insertProjectCopy` clona o último snapshot salvo com título `Cópia de ...` e recibo deduplicado por `(link_id, user_id)` enquanto a cópia existir.
- **Interface web**: `ShareDialog.svelte` oferece os 4 modos com avisos específicos de permissão e revogação; `/participar` (pré-renderizada, `noindex`, `no-referrer`) lê `#edit.<token>` ou `#clone.<token>`, preserva o fragmento no login/cadastro em `/conta` (`participationReturnPath`) e exige confirmação explícita antes de chamar `POST /api/shared/redeem`; `/projetos` exibe o selo `Compartilhado com você` e oculta `Compartilhar`/`Excluir` para `editor`; `/editor` oculta `Compartilhar` para `editor`, exibe `Salvo no projeto compartilhado` e trata perda de acesso (`404` ao salvar) preservando o rascunho local com opção `Salvar como novo projeto`.

Validação:
- `pnpm run check` (`tsc` + `svelte-check`) e `pnpm run lint` (`eslint --max-warnings=0`): 0 erros e 0 avisos.
- `vitest run` com PostgreSQL 18 (`humpback-postgres-1`): 25 arquivos / 190 testes passando (incluindo concorrência `save` vs `revoke`, deduplicação e recriação de cópia após exclusão, isolamento entre modos e contas).
- Build de produção e `pnpm run measure:web` (meta < 150 KiB gzip): `/` 41,95 KiB, `/editor` 90,87 KiB, `/ver` 79,16 KiB, `/participar` 71,87 KiB.

Próximo passo: revisar e commitar as alterações na branch / atualizar o PR da fase 7, e validar o fluxo hospedado após o deploy com `0003_project_link_redemptions.sql`.

## Fase 7, auditoria axe e sincronização com a main — 21/11/2026

PR #2 mergeado pelo usuário. A `main` foi integrada a esta branch (`94cb8f9`): Railway, CI, Compose e operação ficaram idênticos à `main`, `config plan` está em dia, e a seção duplicada do PostgreSQL 18 na memória foi removida.

Auditoria, a pedido do usuário. Playwright 1.65.1, axe-core 4.14.1 e Chromium, instalados no scratchpad da sessão e fora do repositório. Resultado:
- diálogo "Compartilhar" (editor, confirmação e `/projetos`, desktop e celular): sem violações. Contraste só falha se medido durante a animação de entrada;
- `/ver`: só `label-content-name-mismatch` nas cadeiras do SVG, a mesma regra aceita no ADR-0009 para o editor. Ela pega também cadeiras vazias, e `docs/revisao-ui-fase5.md` foi corrigido.
- Capturas revisadas sem problema visual.

PR #3 da fase 7 aberto para a `main` em 21/11/2026, com o aval do usuário; CI verde depois do commit de formatação `cab432b`. Próximo: o usuário revisa e faz o merge. Pendentes registráveis no PR: leitor de tela, Moto G84 e teste hospedado. Depois do merge, a festa renumera a migração dela para `0003`.

## Fase 7, etapa 3 (página /ver e painel Compartilhar) concluída localmente — 21/11/2026

Pedido do usuário, na branch `carrijoga/link-compartilhamento-somente`.
- `apps/web/src/routes/ver/` é pré-renderizada, com noindex e `no-referrer`, e lê o token do fragmento. Tem a busca "Encontre seu lugar", sem diferença de acento, zoom e `SeatList` somente leitura.
- `lib/share/client.ts` faz as chamadas, o `toViewProject` e a validação da resposta. `lib/share/ShareDialog.svelte` carrega sob demanda no editor (só projeto da conta) e em `/projetos`.
- `PlanCanvas` ganhou `readonly`, `anonymous` e `reveal(seatId)`. `SeatList` ganhou `readonly` e `anonymous`. `scripts/measure-web.mjs` mede `/ver` também.

Validação:
- check, lint e 180 testes, com PostgreSQL 18.7 no Compose novo.
- Bundle: `/ver` 78,8 KiB, `/editor` 90,5 (base 88,4), `/` 41,9 (base 41,5).
- Navegador local (Chrome do usuário pela extensão; o Playwright do plugin não acha o Chrome):
  - diálogo no editor cria o link;
  - `/ver` mostra título, data e 5 de 40 ocupados, sem vazar nota, convidado sem lugar nem título;
  - busca "joao" acha "João" e destaca a cadeira;
  - modo planta sem nomes; desativado e incompleto mostram a mensagem certa;
  - a lista não tem seletor;
  - logs da API sem token.
- Correção do teste: o `title` no botão "Compartilhar" do editor trocava o nome acessível, então foi removido.

Não verificados:
- capturas de tela: o Chrome limitava a janela a 2 quadros por segundo;
- clique no diálogo de `/projetos`: outra extensão do Chrome bloqueou a automação, mas a árvore mostrou "Links ativos 1 de 10" carregados;
- celular, leitor de tela e axe.

Próximo passo: etapa 4 (axe em `/ver` e no diálogo, NVDA/TalkBack, Moto G84, olhar visual pelo usuário) e PR da fase 7 para a `main`, depois do merge do PR #2. A festa renumera a migração dela para `0003` ao entrar depois.

## PostgreSQL da Railway travado e correção para 18 — 20/11/2026

Após `railway config apply` do usuário (rodado em `Documents/dev/enlace`, branch `codex/ceremony-editor`, com `postgres-ssl:17`), o serviço `postgres` ficou CRASHED: "This image runs PostgreSQL 17 but the data directory holds major version 18". O volume nasceu em 18.6 (padrão do SDK) e já tinha contas e projetos; a API seguia no ar com `/health` 200 e `/ready` 503. Decisão do usuário: manter os dados e ir para 18.

Feito neste worktree: cherry-pick de `e800544` (`PORT=3000`, só existia em `codex/ceremony-editor`; sem ele o plano apagava `api.PORT`). Imagem `postgres-ssl:18` em `.railway/railway.ts`, `postgres:18-alpine` na CI e no Compose (volume novo `enlace_postgres18_data` em `/var/lib/postgresql`; o antigo, da 17, fica intocado), `pg_dump` 18 em `docs/operacao.md` e revisão no ADR-0013. Suíte completa (173) passou em PostgreSQL 18.7 num contêiner temporário. O worktree foi vinculado ao projeto Railway (`railway link`). `railway config plan` daqui: 0 a adicionar, 1 a mudar (imagem para `ghcr.io/railwayapp-templates/postgres-ssl:18` no grafo desejado; a CLI exibe "postgres:18"), 0 a destruir.

`.railway/railway.ts` declara `PORT=3000` e `SHARE_LINK_SECRET` (`preserve()`): variáveis não declaradas são apagadas pelo `apply`. Correção levada à `main` pelo PR #2 (mergeado em 21/11/2026). Resolvido em 21/11/2026 01:08 UTC: o usuário rodou `apply` deste worktree. O postgres voltou a SUCCESS em 18.6, com "Skipping initialization" e desligamento limpo anterior (dados preservados). `/ready` responde 200, a API atende `/api/projects/:id` com 200, e `config plan` está em dia. Não rodar `apply` de `Documents/dev/enlace` enquanto ele declarar 17. Levar esta correção à `main`. `SHARE_LINK_SECRET` gravado no serviço `api` em 21/11/2026, a pedido do usuário: 64 caracteres aleatórios, enviados por stdin e nunca exibidos, diferente de `BETTER_AUTH_SECRET`. Foi usado `--skip-deploys`, então vale a partir do próximo deploy.

## Fase 7, etapa 2 (API dos links) concluída localmente — 20/11/2026

Pedido do usuário.
- Migração `0002_share_links.sql`: tabela `project_share_links`, sem o token.
- `apps/api/src/projects/share-token.ts`: HMAC-SHA256 com contexto `enlace-share-link:v1:` e `timingSafeEqual`, recusando codificação não canônica.
- `share-links.ts`: list, create com a linha do projeto bloqueada e limite de 10, revoke idempotente com corpo `{}`, e view com `REPEATABLE READ`, `readSnapshot` e `toSharedView`.
- Rotas no `app.ts`, com `sameOriginJson` separado de `writable` para não exigir o store de projetos.
- `store.ts` passou a exportar `transaction` e `readSnapshot`.
- Proxy liberou `projects/:id/share-links[/:linkId]` e `shared/view`.
- A API depende de `@enlace/domain`, e `build:api` compila o domínio.
- `SHARE_LINK_SECRET` é obrigatória em produção, com 32+ caracteres e diferente de `BETTER_AUTH_SECRET`. Foi incluída em `.railway/railway.ts` (`preserve()`), `.env.example` e no runbook. O primeiro deploy precisa dela, ou a API não sobe.
- Desvio registrado no ADR: o limite é por link e por instância (600/min), não por IP, porque a API só vê o proxy.

Validação: 173 testes passaram com PostgreSQL 17 local (`TEST_DATABASE_URL` no contêiner `humpback-postgres-1`, criado por este worktree com volume próprio; `--maxWorkers=2 --testTimeout=30000`). check, lint, prettier (arquivos alterados) e `build:api` ok. O integrado cobre:
- os dois modos sem dados privados no JSON;
- última revisão salva, e links não mudam a revisão;
- isolamento entre contas;
- token recusado como Bearer ou cookie de sessão;
- desativado, vencido e de outro segredo respondem 404;
- limite de 10 com 13 criações simultâneas;
- cascata ao excluir o projeto.

Não verificados: role de runtime real com a tabela nova (coberta por `ALTER DEFAULT PRIVILEGES`, sem teste próprio), proxy Vercel→Railway hospedado.

Próximo passo do tema: etapa 3. Página `/ver` pré-renderizada, com token no fragmento e `POST /api/shared/view`; `PlanCanvas`/`SeatList` com modo somente leitura explícito; busca "Encontre seu lugar"; noindex e `Referrer-Policy: no-referrer`; painel "Compartilhar" no editor e em `/projetos`.

## Fase 7, etapa 1 (contratos e projeção) concluída localmente — 20/11/2026

Pedido do usuário. Em `@enlace/contracts`: `createShareLinkRequestSchema`, `shareLinkSchema`, `shareLinkListResponseSchema`, `sharedViewRequestSchema`, `sharedViewSchema` (união `names`/`plan`, estrita, layout sem `linkedCounts`), `MAX_ACTIVE_SHARE_LINKS` (10) e `SHARE_TOKEN_LENGTH` (64). Em `@enlace/domain`: `toSharedView(project, mode)`, com cópia campo a campo, só pessoas sentadas, na ordem da planta. O título ficou fora da projeção (questão aberta no ADR). Documentado em `docs/contratos.md`.

Validação: 133 testes passaram (15 integrados pulados, sem PostgreSQL), check/lint/prettier ok. Os testes verificam no JSON serializado a ausência de notas, título, IDs e convidados sem lugar, e de nomes e categorias no modo `plan`. Neste worktree foi preciso `pnpm install --frozen-lockfile` e `svelte-kit sync` antes dos testes web. Cuidado: `prettier --write` troca CRLF por LF em arquivos não alterados; restaurar antes de commitar.

Correção de estado: o PR #1 já integrou `codex/ceremony-editor` à `main` (`3e32527`), então o bloqueio "main atrasada" da seção de deploy está resolvido. Continua pendente a aprovação do usuário para `railway config apply`.

Próximo passo do tema: etapa 2. Tabela `project_share_links` e migração; token HMAC com `SHARE_LINK_SECRET` (`node:crypto`, `timingSafeEqual`); rotas de gerenciamento por dono e `POST /api/shared/view`; limite de requisições; allowlist do proxy; testes integrados de acesso cruzado, revogação, validade e limite de 10 sob concorrência. A API passa a depender de `@enlace/domain`.

## Link de visualização proposto como fase 7 — 20/11/2026

Pedido do usuário, só documentado, sem código. Registrado em ADR-0014 (proposta), na fase 7 do roadmap e numa seção do `PRODUCT.md`. A tabela de evoluções em `modelo-de-dados.md` foi atualizada. Decisões do usuário: link para quem não tem conta, somente leitura; vários links com nome por projeto; o dono escolhe em cada link o modo "Com nomes" ou "Só a planta" e a validade (7, 30, 90 dias ou sem prazo); a execução vem antes da festa (fase 6), depois do aceite hospedado da fase 5. A numeração 7 foi mantida para não renumerar a festa. Proposta técnica: tabela `project_share_links` sem o token; token = `linkId` + HMAC (`SHARE_LINK_SECRET`) no fragmento `/ver#…`, enviado no corpo de `POST /api/shared/view`; projeção pura `toSharedView` sem notas, IDs, dono nem convidados sem lugar; limite de 10 links ativos; sem rastrear quem vê. Próximo passo do tema: o mesmo da fase 5 (aceite hospedado) e, em seguida, a etapa 1 da fase 7 (contratos e projeção).

## Deploy da API na Railway em preparação — 09/11/2026

ADR-0013. Pedido do usuário. `railway.toml` removido (Railway descontinuou; leitura termina em 01/12/2026) e substituído por `.railway/railway.ts` com SDK `railway` 3.16.0: serviço `api` da branch `main` (alterado pelo usuário), US East, PostgreSQL 17, pré-deploy `node apps/api/dist/db/migrate.js`. Novos: `MIGRATOR_DATABASE_URL` em `migrate.ts` e `scripts/db-bootstrap-roles.mjs`. Sem Cloudflare na API (o navegador só fala com a Vercel).

Validação: check/lint ok, 122 testes passaram e 15 integrados pulados; ensaio em contêineres `node:24.22.1-slim` + PostgreSQL 17 com `NODE_ENV=production`: install, build, bootstrap, migração com roles separadas, `/health`, `/ready`, cadastro e SIGTERM ok. Não verificados: Railpack real, HTTPS/cookies pela Vercel, privilégios na hospedagem. Nada provisionado. Entrega commitada em `codex/ceremony-editor`, sem push nem merge na `main`.

Bloqueios, em ordem: (1) `origin/main` está 9 commits atrás e não tem auth/projetos/migração, então esta entrega precisa chegar à `main` antes do primeiro deploy; (2) aprovação do usuário para `railway config apply`. CLI 5.71.0 instalada e autenticada; pasta vinculada ao projeto Railway `Enlace` (vazio), ambiente `production`; plano: criar `api` e `postgres`, sem alterar ou destruir nada. `WEB_ORIGIN=https://enlace.carrijoga.com.br`, sem barra final (Cloudflare → Vercel, no ar; `/api/health` responde 503 até a API existir e `API_ORIGIN` apontar para ela). Depois seguir o runbook em `docs/desenvolvimento.md`. SMTP real continua sem configuração.

## Planta da festa proposta como fase 6 — 09/11/2026

Pedido do usuário, só documentado, sem código: ADR-0012 (proposta), fase 6 no roadmap e seção em `PRODUCT.md`. Decisões do usuário: medidas reais informadas pela pessoa; convidados por mesa, cada mesa com N cadeiras; salão em formato pronto ou criado manualmente com medidas reais (interpretação registrada: polígono ortogonal, parede a parede); fase 6 aprovada. Lista de convidados compartilhada com a cerimônia e início após o aceite hospedado da fase 5 são recomendações. Muda contrato (JSON v2), banco e domínio; risco principal é arraste no celular, com ensaio no Moto G84 como primeira etapa. Próximo passo do tema: aceite da fase 5 ou decisão do usuário de antecipar.

## Movimento da interface concluído localmente — 08/11/2026

ADR-0011, seção Motion em `DESIGN.md`. Nativo (CSS, WAAPI, `svelte/animate`, View Transitions), sem biblioteca. Landing: a planta se arma e 10 lugares ilustrativos são ocupados. Editor (`lib/editor/plan-motion.ts`): cadeiras deslizam com animação aditiva ao mudar `layout`, aro dourado ao receber a pessoa, fio dourado de ocupação, estado de salvamento, contadores, menu, diálogos e aba móvel. `/projetos`: entrada em cascata e remoção com `flip`/`slide`. Acima de 120 cadeiras (`SEAT_MOTION_LIMIT`) nada anima no SVG e as animações de seleção ficam desligadas.

Validação em build de produção: check/lint ok, testes web ok, navegador em landing, editor, `/projetos` (API simulada no navegador) e aba móvel. A/B 288 cadeiras, mesma origem de host, p95: selecionar 14,7–19,5 (base 15,6–18,2), trocar 46,7–50,1 (base 43,7–50,4). JS gzip: landing +2,1 KiB, editor +2,5 KiB. Não verificados: Moto G84 (limite de 120 só medido no desktop), preferência real de movimento reduzido, Safari/Firefox. Commit próprio em `codex/ceremony-editor`, sem push.

Próximo passo do tema: medir o deslizamento no Moto G84 junto do ensaio já pendente da fase 5.

## Exportação PNG refeita no cartão v3 — 08/11/2026

ADR-0010. `pure-svg.ts` voltou à composição do v3 (moldura, argolas, título, arco, corredor tracejado, guias da meia-lua, resumo, assinatura), com correções de rótulos que colidiam, nomes sem deformação e homônimos com inicial. Validação: check/lint/format ok; 120 testes, 15 integrados pulados (sem PostgreSQL); navegador com PNG real 3200×2778 e individual, 12×12, planta mínima, um lado só e nomes longos (maior nome 47,5 em cadeira de 50). Por decisão do usuário, o mapa individual mostra casal e data como o v3, sem dados dos demais convidados. Sem commit; impressão não alterada.

## Contexto de produto atualizado (Impeccable init) — 08/11/2026

`PRODUCT.md` da raiz, compartilhado com `apps/web`, ganhou posicionamento ("a planta é o produto"), contexto de uso, voz, evidências e acessibilidade, todos confirmados pelo usuário: celular tanto quanto computador no fluxo completo; afeto na landing e clareza na ferramenta; meta WCAG 2.2 AA em todas as telas, incluindo alternativa à planta para leitor de tela, ainda não auditada. Tensão a resolver na fase 5: paridade no celular versus limite conhecido do ADR-0006. `DESIGN.md` não foi alterado. Live mode configurado em `apps/web/.impeccable/live/config.json` (sem CSP), ainda não exercitado.

## Fase 5 em execução — 08/11/2026

Iniciada após conferência do código e Git: fase 4 presente no working tree, ainda sem commit. Preservar essas alterações e arquivos paralelos do usuário. Frentes independentes com subagents gpt-6-luna: interface/editor/CSV; exclusão autenticada de conta; operação e ensaio de restauração. Coordenador integra projetos/importação idempotente, validações e documentação. Sem publicação ou provisionamento. Aceite remoto e celular físico identificado continuam dependentes de ambiente; não declarar a fase concluída apenas com validação local.

Continuação em 08/11 (Claude Opus coordenando; subagent Sonnet em landing/conta/projetos, arquivos exclusivos). Auditoria axe-core 4.14 (fora do repo) em todas as telas, 1280×900 e 390×844: nenhuma violação em landing, conta, projetos e CSV. No editor restam `label-content-name-mismatch` nas cadeiras ocupadas (aceito, ADR-0009) e `target-size` causado pela faixa fixa de aviso. Novo: `SeatList.svelte` ("Ver lugares em lista", montado só ao abrir), link de pular para a planta, Tab único na planta, token `--field-line`, textos mínimos de 11 px no editor móvel, `minlength` 12 no cadastro/redefinição, `createUuid` em `@enlace/contracts` (substitui `crypto.randomUUID` em web/domain/contracts; adicionar convidado em HTTP na rede local deixou de falhar). `bench-editor.js` corrigido (o `pagehide` sobrescrevia o seed).

Validação: check 0 erros, lint/format ok, 131 testes com PostgreSQL (`--maxWorkers=2 --testTimeout=30000`; sem isso 4 integrados estouram 5 s), landing 39,31 e editor 85,03 KiB gzip. Benchmark headless ruidoso: rodada limpa com pior p95 de 27,3 ms, outras com picos; não é aceite. O `minlength` 12 na exclusão de conta está correto: o servidor exige 12.

## Fase 4 concluída localmente — 08/11/2026

ADR-0008. CSV de convidados: `apps/web/src/lib/editor/files/csv.ts` (parser RFC 4180 próprio, UTF-8/Windows-1252, limites 1 MiB/1000 registros/30 colunas) e `CsvImportDialog.svelte` (carregado sob demanda pelo botão "Importar CSV" do painel de convidados). Prévia com separador, cabeçalho, mapeamento de colunas e de categorias desconhecidas, aviso de duplicidade sem merge, erros por linha bloqueando a confirmação. Lote via `addGuests` (domínio): um passo de desfazer e uma revisão na conta. `/projetos` ganhou "Importar JSON como novo projeto" (novos IDs de projeto/operação, dono pela sessão).

Subagents Claude Sonnet (econômicos): parser+testes e importação JSON em `/projetos`, arquivos exclusivos; coordenador fez contrato, domínio, diálogo, integração, testes no navegador e docs. Revisão encontrou: `matchCategory` aceitava chaves de protótipo (corrigido pelo subagent) e CSV sem cabeçalho com "convidada" virava cabeçalho (corrigido pelo coordenador, com inferência da coluna de categoria).

Validação: 117 testes (com PostgreSQL), check/lint/format ok, editor 83,73 KiB gzip inicial, CSV em chunk separado. Navegador: fluxo completo local e na conta (docs/validacao-fase4.md). Pendentes: acessibilidade/celular do diálogo CSV, prévia com 1000 linhas medida, idempotência do import JSON em queda de rede.

## Fase 3 concluída localmente — 08/11/2026

Implementação (agent anterior, tokens esgotados antes de fechar) revisada e validada nesta sessão por Claude. Better Auth e-mail/senha, proxy same-origin `/api/*`, Drizzle schema + migrações SQL (0000 baseline, 0001 remove índice de recibos — estava vazia, corrigida), roles `enlace_runtime`/`enlace_migrator`, API de projetos por proprietário com `expectedRevision` + `operationId`, telas `/conta` e `/projetos`, editor remoto em `/editor?project=UUID` com conflito visível e rascunho por conta/projeto. ADR-0007.

Validação: check/lint/format ok; 64 testes unitários; 36 integrados com PostgreSQL 17 real (Docker local, `TEST_DATABASE_URL`, `TEST_CREATE_DATABASE=1`). Navegador: criar conta, criar projeto, salvar (rev 2), conflito com outro dispositivo, salvar como cópia, isolamento entre contas (401/404). Corrigidos: `rawAccountDraft` sem `$state` (bloco de recuperação não aparecia), import não usado, formatação, tela presa em "Preparando seu espaço…" com aviso de sincronização falso ao abrir projeto negado/sem sessão. Detalhes e limites em docs/validacao-fase3.md.

Pendente (dependente de ambiente, fica para fase 5): cookies/origem Vercel↔Railway em HTTPS, SMTP real, aparelho físico. Decidir se sair deve limpar rascunhos da conta no localStorage (computador compartilhado). Acessibilidade de /conta e /projetos não auditada.

Execução local da fase 3: `pnpm run db:up`, `pnpm run db:migrate`, `apps/api/.env` e `apps/web/.env` (ignorados) e configs `api-dev` (3011) / `web-dev` (5183) em `.claude/launch.json`. Portas 3001/5173 estavam ocupadas por servidores antigos do agent anterior. Em 08/11, `WEB_ORIGIN` de `apps/api/.env` passou a `http://192.168.0.221:5173` (acesso pela rede local, API em 3011); `localhost:5173` e a config `web-dev` (5183) recebem 403 `invalid_origin` até trocar esse valor. Credenciais de teste: contas fictícias @example.test com senha aleatória (não reutilizáveis).

## Estado atual

Fase 2 concluída em 08/11/2026 (ADR-0006): landing `/` e editor local `/editor`. Desempenho no limite otimizado em 08/11: p95 ≤ 50 ms no desktop com e sem pintura (modo frame, painel visível, pior p95 37,1 ms). Celular físico (Android, Chrome 156, execução 1): formato p95 62 e filtro 57,6 acima da meta; busca 49,4, troca 46,5, seleções ~30. Corrigido filtro/busca (linhas sempre montadas + `hidden`) e reduzido o script da troca de formato. A/B no mesmo celular (antigo×novo, ABBA): correção melhora p95 de filtro (86→69) e busca (77→57), resto igual; mas neste aparelho quase todas as ações ficam em ~50–70 ms de p95 (variação grande entre execuções). Decisão do usuário (ADR-0006): orçamento 50 ms mantido, aceite pelo desktop de referência, este celular registrado como limite conhecido; classe de celular de referência e otimização para aparelhos de entrada ficam para a fase 5. Frontend Vercel, API Hono/Node e PostgreSQL privado Railway. Sem Supabase, push, deploy ou provisionamento.

Branch `codex/ceremony-editor`. Commits locais: `91fab30` (base fase 1), `60f3298` (domínio); a entrega integrada do editor e seus documentos é registrada nesta branch por commit funcional. Remoto https://github.com/carrijoga/enlace.git. Conferir Git antes de retomar. Arquivos Docker/VS Code paralelos do usuário permanecem fora dos commits dos agents.

## Implementado

- pnpm workspace, Node 24.22.1 / pnpm 12.18.0 / TS 6, SvelteKit 3 / Svelte 5 / Vite 8, Hono, Drizzle/pg. Configuração Vercel/Railway, health/readiness, proxy GET /api/health, pool lazy e Compose PostgreSQL 17 preparados. Fase 3 acrescentou schema/migrações, Better Auth e API de projetos (ver seção da fase 3).
- Contratos Zod estritos, JSON enlace-project/schemaVersion 1, parser/migração v3, limites/UUIDs/referências validados.
- packages/domain: geometria tradicional/meia-lua, corredor, fileiras e assentos; comandos puros imutáveis, atribuir/mover/trocar sem duplicar ocupantes, remover lugares preservando convidados.
- Editor: estrutura, casal/data, convidados/categorias/busca, clique/toque/teclado e implementação de arrastar; zoom/ajuste, desfazer/refazer 35 entradas, confirmação de mudanças estruturais com perda de lugares.
- Rascunho anônimo local por origem, debounce 250 ms, erro/quota e recuperação explícita de rascunho corrompido; snapshots sem proxies profundos. Com conta, o editor sincroniza com a API (fase 3); o rascunho anônimo continua separado.
- JSON novo/v3, PNG geral/individual lazy e impressão. Individual mostra destinatário/cadeira, casal/data e geometria neutra (ADR-0010). Mapa geral usa primeiro nome ajustado à cadeira, com inicial do sobrenome para homônimos.
- Vercel Web Analytics via `inject()` em `apps/web/src/routes/+layout.svelte` (helper SvelteKit incompatível com Kit 3; aviso de peer esperado). Ativação no painel Vercel e verificação em deploy pendentes. Instalação local usa `--store-dir .pnpm-store` (store do `node_modules` atual).
- Otimização 08/11 (ADR-0005): comandos de domínio validam mas devolvem o objeto do comando (compartilhamento estrutural, sem cópia profunda do Zod); `getSeatLabels`; editor compara sem `JSON.stringify`; centralização da planta depende só da largura; SVG em pixels via `bind:offsetWidth/offsetHeight` (percentual fazia o Chrome refazer layout das 288 cadeiras); linhas de convidados com `content-visibility: auto`; lista sempre montada, filtro/busca só alternam `hidden`; `PlanCanvas` itera lista de cadeiras estável e só o `transform` lê as posições novas. Custo restante do formato: layout/pintura das 576 legendas SVG. Benchmark reproduzível em `scripts/bench-editor.js`; ensaio em celular via `scripts/bench-phone.html`.
- Landing direciona ao editor, sem login/nuvem/CSV fictícios. Identidade Papel e jardim, SVG/CSS nativos e nenhuma nova biblioteca visual/de estado.

## Validações e limites

40 testes passaram em 7 arquivos, tipos sem erros/avisos Svelte, lint/formatação/build local aprovados. Navegador confirmou atribuição/troca, confirmação/cancelamento/desfazer, setas/Enter, JSON/PNG reais, importação sintética e rejeição de versão inválida, reload do rascunho máximo. Capturas desktop 1170×900 e mobile 390×844 sem overflow. Mapa mobile em fluxo, evitando sobrepor controles.

JS inicial produção (08/11): landing 39.812 bytes/38,88 KiB gzip; editor 81.159 bytes/79,26 KiB, abaixo de 150 KiB. Cenário 288/300, 20 amostras/ação: antes 46,9–120,7 ms (modo frame, com pintura); depois, modo layout (sem pintura, painel oculto): execução 1 formato 67,9 (2 picos), seleção 10,8–11,2, troca 27, filtro 33,5, busca 25; execução 2 todas ≤ 49,3; série de 40 formatos p95 23,1. 44 testes, check/lint/format ok. Modo frame (com pintura, painel visível), duas execuções: formato 29,1/31,5; cadeira 16,6/17,0; pessoa 18,2/17,4; troca 27,4/22,8; filtro 37,1/36,8; busca 33,6/32,9. Falta caracterizar hardware e celular físico. Relatório completo em docs/validacao-fase2.md; artefatos sintéticos/capturas ignorados em .impeccable/review.

Subagents econômicos gpt-6-luna: domínio, arquivos, painéis, landing, medição, revisão e documentação. Revisor aprovou interface/código no escopo de capturas e confirmou integridade das otimizações. Inspeção do PNG geral revelou sobreposição de nomes; correção em duas linhas incluída nesta entrega. Motor/detector Impeccable indisponível por cache/permissões; fallback manual, sem auditoria completa de acessibilidade. Ver relatório para alcance exato da revisão.

Windows bloqueia symlinks do pacote Vercel: build local gera preview; `build:vercel` aguarda Linux/CI. (Fase 2.) Impressora física, arrastar automatizado, offline, export repetido/memória e celular físico não verificados. CSV fase 4.

## Como retomar

Ler README, PRODUCT, roadmap e documentos técnicos pertinentes. `pnpm install --frozen-lockfile`, `pnpm run dev`; web 5173 / API 3001. Scripts compilam contracts/domain antes de consumidores e observam no dev conjunto. Ver docs/desenvolvimento.md. Servidores de QA são encerrados ao concluir, não presumir ativos. A origem/porta separa os rascunhos; JSON transporta dados manualmente.

Neste ambiente o `node` do PATH pode ser shim pnpm que tenta baixar runtime. Para comandos locais usar primeiro no PATH: C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin. Runtime já disponível 24.22.1.

## Próximo passo concreto

Fase 5, parte local praticamente fechada. Fases 4 e 5 commitadas juntas em `codex/ceremony-editor`, sem push; Docker, VS Code e `.claude/` seguem fora dos commits. Próximo, em ordem: (1) ensaio no Moto G84 pela rede local (`web-preview-lan` e `scripts/bench-phone.html`), registrando navegador/versão; (2) ensaio real de restauração, que exige `pg_dump`/`pg_restore` 17 no PATH; (3) teste com leitor de tela (NVDA/TalkBack); (4) ambiente de teste Vercel/Railway para cookies/origem, SMTP, `build:vercel`, migrações e privilégios — provisionamento só com aprovação explícita do usuário. Não provisionar recursos pagos nem publicar como efeito colateral. Para repetir ensaios de desempenho: `scripts/bench-editor.js` e `scripts/bench-phone.html` (ver docs/desempenho.md).

Questões futuras: colaboração entre contas, cenários alternativos, medidas reais/altar livre, regras familiares configuráveis, e-mail, domínio, região/recursos/orçamento. ADR-0004 registra rotas, editor local e commits por entrega coesa; fases são marcos.

## Regras e alterações preservadas

AGENTS.md contém as regras permanentes. Usar subagents econômicos para tarefas independentes, arquivos exclusivos e contratos prévios; só coordenador escreve MEMORY em paralelo. Atualizar documentação/roadmap/memória; não publicar dados pessoais nem descrever planejado como implementado. Autorização sempre no servidor e nenhuma sobrescrita concorrente silenciosa na futura nuvem.

Preservados sem incluir nos commits: Dockerfile, .dockerignore, compose.yaml, compose.debug.yaml, .vscode/launch.json e tasks.json. Scripts db usam explicitamente docker-compose.yml. O Dockerfile raiz, não versionado, não descreve o build da API e não é usado pela Railway.

Original privado ignorado: prototypes/private/Planejador-da-Cerimonia-v3.html, 62.046 bytes, SHA256 7d9f86a0b89b33f6113efa4ff14f8765882a1351b0e727476866d93d813d2426. Fonte Downloads; não publicar, nem usar dados pessoais como fixture. Diagnóstico histórico permanece separado das melhorias novas.

Nenhum subagent com implementação pendente ao encerrar.

