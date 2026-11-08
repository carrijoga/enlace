# Memória do projeto — Enlace

Última atualização: 07/11/2026 (America/Sao_Paulo).

## Estado atual

Fase 1 — base executável e contratos concluída no escopo local. Próximo passo: fase 2 — migrar o editor. Frontend SvelteKit na Vercel; API Hono/Node e PostgreSQL privado na Railway, por decisão do usuário. Direção vigente no ADR-0003; ele substitui a proposta de aplicação única/adapter-node do ADR-0002. Sem Supabase.

O repositório começou vazio, com apenas Git e sem commits. Remoto configurado: https://github.com/carrijoga/enlace.git. Não foram feitos commits, push, deploy ou provisionamento.

## Regras permanentes

Usar subagents para tarefas independentes, com modelos básicos/econômicos conforme pedido mais recente do usuário; foram usados subagents gpt-6-luna. Definir arquivos e contratos antes de delegar. Coordenador integra os resultados e é o único escritor desta memória. Documentar decisões relevantes e conferir código/Git antes de retomar. Regras completas em AGENTS.md.

## Implementado nesta entrega

- Workspace pnpm com apps/web, apps/api e packages/contracts. Node 24.22.1, pnpm 12.18.0, TypeScript 6 e versões compatíveis no lockfile.
- Web: SvelteKit 3, Svelte 5, adapter-vercel, CSS/SVG/reatividade nativos; exemplo fictício, prévia esquemática por fileira, leitura de JSON e download no formato atual. Contratos carregados sob demanda.
- API: Hono, listener separado da factory, configuração de ambiente, health/readiness, CORS restrito, cabeçalhos, limite de 2 MiB e erros públicos genéricos.
- PostgreSQL: driver pg/Drizzle e pool lazy limitado, timeout e shutdown; Compose PostgreSQL 17 local preparado. Sem schema ou migrações de negócio ainda.
- Contratos Zod estritos: envelope enlace-project/schemaVersion 1, UUIDs, limites, datas e integridade de atribuições; migração explícita v3 com defaults neutros e IDs remapeados.
- Transporte implementado na web apenas GET /api/health → GET /health da API. API_ORIGIN é configuração privada do servidor.
- Scripts de dev, tipos, lint, formato, testes, builds e medição; CI GitHub Actions, railway.toml e apps/web/vercel.json preparados, sem execução remota.
- Documentos atualizados: arquitetura, modelo de dados, contratos, desenvolvimento, validação, roadmap, ADR-0003 e produto; DESIGN.md e .impeccable/design.json extraem a identidade herdada.

## Como retomar e executar

Leia README.md e docs/desenvolvimento.md. Pela raiz, com Node/pnpm corretos: pnpm install --frozen-lockfile; depois pnpm run dev. Frontend em http://localhost:5173, API em http://localhost:3001. Ctrl+C encerra os processos. Os servidores de QA desta sessão foram encerrados; não presumir que ainda estejam ativos.

O comando conjunto compila/observa contracts antes dos consumidores. Separadamente, recompile/observe contracts ao alterá-los. O build Windows é para preview local; build:vercel exige o pacote completo na CI Linux/Vercel. Não confundir compilação local com deploy validado.

## Validações e limites

- 25 testes passaram em quatro arquivos; check sem erros/avisos Svelte, lint e format:check aprovados.
- Contratos, API e frontend compilados para preview local. JavaScript inicial da tela base: 37.679 bytes, 36,80 KiB gzip; meta inicial 150 KiB. Editor completo e p95 ainda não medidos.
- HTTP 200 confirmado na página, API /health e proxy /api/health. Navegador confirmou exemplo, download JSON real e estado de conexão.
- Capturas desktop 1440 px/mobile 390 px; mobile sem overflow horizontal. Revisor independente econômico retornou ship sem achados materiais; revisão estática, sem auditoria completa de teclado ou contraste calculado.
- Pacote Vercel não concluiu no Windows por EPERM nos symlinks de funções, inclusive fora do sandbox. Há comando dedicado/CI Linux para validar esse pacote. Não alterar permissões do Windows para contornar.
- Docker daemon não estava ativo. Compose foi validado estaticamente, sem executar banco, migrações ou conexão PostgreSQL real.
- Nenhuma autenticação, sessão, API de projeto, salvamento remoto, CSV ou PNG novo implementados. Better Auth permanece recomendado para fase 3, não instalado.
- Motor/detector Impeccable não executou por cache/permissões; fallback manual de código/capturas e revisão independente. Evidências e limites em docs/validacao-fase1.md.

## Alterações paralelas preservadas

Durante a execução surgiram Dockerfile, .dockerignore, compose.yaml, compose.debug.yaml e .vscode/launch.json e tasks.json, não criados pelos agents desta entrega. Foram preservados. Os scripts db:up/db:down apontam explicitamente para docker-compose.yml para não selecionar compose.yaml por engano. Antes de publicar na Railway, revisar a detecção do Dockerfile raiz, que não descreve o build da API preparado nesta entrega.

## Referência privada preservada

Origem: C:\Users\gabri\Downloads\Planejador-da-Cerimonia-v3.html. Cópia local ignorada: prototypes/private/Planejador-da-Cerimonia-v3.html, 62.046 bytes. SHA-256: 7d9f86a0b89b33f6113efa4ff14f8765882a1351b0e727476866d93d813d2426. Não publicar dados pessoais/regras familiares do modelo nem usá-los como fixtures.

O protótipo já possui planta, convidados, atribuições, salvamento local, JSON, PNG geral/individual e impressão. Altar fixo e planta esquemática. Diagnóstico histórico em docs/diagnostico-prototipo.md permanece válido.

## Próximo passo concreto

Extrair geometria e comandos puros para packages/domain, com IDs do contrato já implementado. Migrar controles, planta interativa, posicionamento/troca, convidados e desfazer para a web, preservando o trabalho local e a importação v3. Medir editor com 55/288 cadeiras e até 300 convidados. Depois implementar contas, schema/transações e sincronização da fase 3.

Nenhum agent com trabalho pendente. Questões futuras: colaboração entre contas, cenários alternativos, regras familiares configuráveis, medidas reais/altar livre, transporte de e-mail, região/recursos/orçamento e domínio.
