# Memória do projeto — Enlace

Atualizado em 07/11/2026, America/Sao_Paulo.

## Estado atual

Fase 2 funcional: landing `/` e editor local `/editor`. Aceite de desempenho no limite e celular físico ainda pendentes; não declarar a fase totalmente concluída. Frontend Vercel, API Hono/Node e PostgreSQL privado Railway. Sem Supabase, push, deploy ou provisionamento.

Branch `codex/ceremony-editor`. Commits locais: `91fab30` (base fase 1), `60f3298` (domínio); a entrega integrada do editor e seus documentos é registrada nesta branch por commit funcional. Remoto https://github.com/carrijoga/enlace.git. Conferir Git antes de retomar. Arquivos Docker/VS Code paralelos do usuário permanecem fora dos commits dos agents.

## Implementado

- pnpm workspace, Node 24.22.1 / pnpm 12.18.0 / TS 6, SvelteKit 3 / Svelte 5 / Vite 8, Hono, Drizzle/pg. Configuração Vercel/Railway, health/readiness, proxy GET /api/health, pool lazy e Compose PostgreSQL 17 preparados. Sem schema/migrações de negócio, autenticação ou API de projeto.
- Contratos Zod estritos, JSON enlace-project/schemaVersion 1, parser/migração v3, limites/UUIDs/referências validados.
- packages/domain: geometria tradicional/meia-lua, corredor, fileiras e assentos; comandos puros imutáveis, atribuir/mover/trocar sem duplicar ocupantes, remover lugares preservando convidados.
- Editor: estrutura, casal/data, convidados/categorias/busca, clique/toque/teclado e implementação de arrastar; zoom/ajuste, desfazer/refazer 35 entradas, confirmação de mudanças estruturais com perda de lugares.
- Rascunho anônimo local por origem, debounce 250 ms, erro/quota e recuperação explícita de rascunho corrompido; snapshots sem proxies profundos. Não existe sincronização entre dispositivos.
- JSON novo/v3, PNG geral/individual lazy e impressão. Individual mostra só destinatário/cadeira e geometria neutra. Mapa geral abrevia nome/sobrenome em duas linhas para não sobrepor vizinhos.
- Landing direciona ao editor, sem login/nuvem/CSV fictícios. Identidade Papel e jardim, SVG/CSS nativos e nenhuma nova biblioteca visual/de estado.

## Validações e limites

40 testes passaram em 7 arquivos, tipos sem erros/avisos Svelte, lint/formatação/build local aprovados. Navegador confirmou atribuição/troca, confirmação/cancelamento/desfazer, setas/Enter, JSON/PNG reais, importação sintética e rejeição de versão inválida, reload do rascunho máximo. Capturas desktop 1170×900 e mobile 390×844 sem overflow. Mapa mobile em fluxo, evitando sobrepor controles.

JS inicial produção: landing 38.592 bytes/37,69 KiB gzip; editor 79.416 bytes/77,55 KiB, ambos abaixo de 150 KiB. 20 trocas de formato por conjunto no Windows/IAB: comum 55 cadeiras/10 convidados p95=12,1 ms; limite 288 cadeiras/300 convidados p95=92,1 ms (meta 50 ms não atingida). Medição comando→tick→rAF, não INP. Falta caracterizar hardware, ampliar ações e medir celular físico. Relatório completo em docs/validacao-fase2.md; artefatos sintéticos/capturas ignorados em .impeccable/review.

Subagents econômicos gpt-6-luna: domínio, arquivos, painéis, landing, medição, revisão e documentação. Revisor aprovou interface/código no escopo de capturas e confirmou integridade das otimizações. Inspeção do PNG geral revelou sobreposição de nomes; correção em duas linhas incluída nesta entrega. Motor/detector Impeccable indisponível por cache/permissões; fallback manual, sem auditoria completa de acessibilidade. Ver relatório para alcance exato da revisão.

Windows bloqueia symlinks do pacote Vercel: build local gera preview; `build:vercel` aguarda Linux/CI. Docker daemon não estava ativo; sem banco real testado. Impressora física, arrastar automatizado, offline, export repetido/memória e celular físico não verificados. Better Auth é recomendação fase 3, não instalada. CSV fase 4.

## Como retomar

Ler README, PRODUCT, roadmap e documentos técnicos pertinentes. `pnpm install --frozen-lockfile`, `pnpm run dev`; web 5173 / API 3001. Scripts compilam contracts/domain antes de consumidores e observam no dev conjunto. Ver docs/desenvolvimento.md. Servidores de QA são encerrados ao concluir, não presumir ativos. A origem/porta separa os rascunhos; JSON transporta dados manualmente.

Neste ambiente o `node` do PATH pode ser shim pnpm que tenta baixar runtime. Para comandos locais usar primeiro no PATH: C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin. Runtime já disponível 24.22.1.

## Próximo passo concreto

Perfilar o custo de renderização/validação no máximo 288/300 para p95 <= 50 ms sem aumentar o orçamento, ampliar benchmark a mover/trocar/filtrar/selecionar e testar num celular real. Depois fase 3: PostgreSQL real, schema/migrações, contas/sessões, consultas por proprietário, transações/revisões e integração do editor com conflitos/falhas verificáveis. Não provisionar recursos pagos nem publicar como efeito colateral.

Questões futuras: colaboração entre contas, cenários alternativos, medidas reais/altar livre, regras familiares configuráveis, e-mail, domínio, região/recursos/orçamento. ADR-0004 registra rotas, editor local e commits por entrega coesa; fases são marcos.

## Regras e alterações preservadas

AGENTS.md contém as regras permanentes. Usar subagents econômicos para tarefas independentes, arquivos exclusivos e contratos prévios; só coordenador escreve MEMORY em paralelo. Atualizar documentação/roadmap/memória; não publicar dados pessoais nem descrever planejado como implementado. Autorização sempre no servidor e nenhuma sobrescrita concorrente silenciosa na futura nuvem.

Preservados sem incluir nos commits: Dockerfile, .dockerignore, compose.yaml, compose.debug.yaml, .vscode/launch.json e tasks.json. Scripts db usam explicitamente docker-compose.yml. Antes de Railway revisar Dockerfile raiz acrescentado em paralelo, que não descreve o build de API desta entrega.

Original privado ignorado: prototypes/private/Planejador-da-Cerimonia-v3.html, 62.046 bytes, SHA256 7d9f86a0b89b33f6113efa4ff14f8765882a1351b0e727476866d93d813d2426. Fonte Downloads; não publicar, nem usar dados pessoais como fixture. Diagnóstico histórico permanece separado das melhorias novas.

Nenhum subagent com implementação pendente ao encerrar.
