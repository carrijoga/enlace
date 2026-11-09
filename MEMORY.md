# Memória do projeto — Enlace

Atualizado em 08/11/2026, America/Sao_Paulo.

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

Execução local da fase 3: `pnpm run db:up`, `pnpm run db:migrate`, `apps/api/.env` e `apps/web/.env` (ignorados) e configs `api-dev` (3011) / `web-dev` (5183) em `.claude/launch.json`. Portas 3001/5173 estavam ocupadas por servidores antigos do agent anterior. Em 08/11, `WEB_ORIGIN` de `apps/api/.env` passou a `http://localhost:5173` (`pnpm run dev` com API em 3011); a config `web-dev` (5183) recebe 403 `invalid_origin` até voltar esse valor. Credenciais de teste: contas fictícias @example.test com senha aleatória (não reutilizáveis).

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

Preservados sem incluir nos commits: Dockerfile, .dockerignore, compose.yaml, compose.debug.yaml, .vscode/launch.json e tasks.json. Scripts db usam explicitamente docker-compose.yml. Antes de Railway revisar Dockerfile raiz acrescentado em paralelo, que não descreve o build de API desta entrega.

Original privado ignorado: prototypes/private/Planejador-da-Cerimonia-v3.html, 62.046 bytes, SHA256 7d9f86a0b89b33f6113efa4ff14f8765882a1351b0e727476866d93d813d2426. Fonte Downloads; não publicar, nem usar dados pessoais como fixture. Diagnóstico histórico permanece separado das melhorias novas.

Nenhum subagent com implementação pendente ao encerrar.

