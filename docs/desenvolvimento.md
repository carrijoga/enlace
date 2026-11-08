# Desenvolvimento e preparação de hospedagem

Atualizado em 08/11/2026. Base, editor local e integração de contas/persistência. Nenhum deploy remoto nesta entrega.

## Ambiente

Node 24.22.1 e pnpm 12.18.0. `pnpm install --frozen-lockfile`; neste checkout o store existente fica em `.pnpm-store` (usar `--store-dir .pnpm-store` se necessário). O lockfile pnpm 12 contém dois documentos YAML e não deve ser editado manualmente.

Neste Windows, se o PATH apontar a um shim que tenta baixar Node, o runtime já instalado fica em `C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`.

| Comando na raiz | Efeito |
| --- | --- |
| `pnpm run dev` | Compila contratos/domínio e observa os dois pacotes, web 5173 e API 3001 |
| `pnpm run dev:web` / `dev:api` | Inicia um app após compilar dependências compartilhadas |
| `pnpm run check` / `lint` / `format:check` / `test` | Tipos, lint, formatação e testes |
| `pnpm run build` | Build local; Windows gera preview da web |
| `pnpm run build:api` | Contratos e API |
| `pnpm run build:vercel` | Pacote completo Vercel; executar Linux/CI |
| `pnpm --filter @enlace/web run preview` | Preview web 4173 |
| `pnpm run measure:web` | Mede JS inicial produção; opção de rota conforme script |
| `pnpm run db:up` / `db:check` / `db:down` | Sobe, verifica ou para PostgreSQL local, preservando volume |
| `pnpm run db:generate` | Gera mudança SQL/metadata a partir do schema Drizzle; revisar antes de aplicar |
| `pnpm run db:predeploy` | Verifica conexão e aplica migrações com credencial de migração explícita |
| `pnpm run db:backup` | Backup lógico em arquivo novo, com `pg_dump` no PATH |
| `pnpm run db:restore:drill` | Restaura somente em banco descartável explicitamente confirmado; ver [operação](operacao.md) |
| `pnpm run db:migrate` | Aplica migrações versionadas com credencial explícita; nunca durante build/requisição |

O adaptador Vercel exige symlinks que falham neste Windows. O sucesso de `build` local não comprova `build:vercel`; a CI exige o segundo.

## Configuração local

A landing `/` e `/editor` anônimo continuam funcionando sem conta/banco. Copie `.env.example` de cada app somente se `.env` ainda não existir; não comite credenciais.

| App | Variável | Uso |
| --- | --- | --- |
| Web | `API_ORIGIN` | Destino fixo do proxy, somente servidor; local `http://localhost:3001`; HTTPS obrigatório em produção |
| API | `PORT` | 3001 local ou porta da Railway |
| API | `WEB_ORIGIN` | Origem pública exata da web, incluindo porta local; HTTPS obrigatório em produção |
| API | `DATABASE_URL` | Conexão privada exclusiva da API |
| API | `BETTER_AUTH_SECRET` | Segredo aleatório com pelo menos 32 caracteres; obrigatório em produção |
| API | `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Transporte de recuperação de senha; sem esses valores o recurso é indisponível |
| API | `SMTP_USER`, `SMTP_PASSWORD` | Credenciais SMTP quando o transporte as exigir |
| API | `NODE_ENV` | `production` na Railway |
| Migração | `PG_MIGRATOR_ROLE` | Role explícita opcional do runner; credencial deve possuir essa associação |
| Testes | `TEST_DATABASE_URL` | Banco descartável/local de teste; suites criam schemas isolados e os removem ao concluir |

A API carrega `.env` pelo Node e a web pela configuração Vite. Reinicie após mudar variáveis. Para gerar o segredo, use gerador criptográfico local e armazene somente no ambiente. Sem segredo/banco, autenticação responde indisponível; não há login fictício.

Com Docker Desktop ativo, `pnpm run db:up` usa explicitamente `docker-compose.yml`. PostgreSQL 17 escuta apenas `127.0.0.1:5432`, em volume nomeado. Os dados/credenciais de Compose são exclusivos de desenvolvimento. O daemon foi iniciado e o banco real validado nesta entrega; nenhuma infraestrutura remota foi criada.

Aplique `pnpm run db:migrate` com `DATABASE_URL` do ambiente de migração, depois inicie os apps. Contas em `/conta`, lista em `/projetos`, editor remoto em `/editor?project=UUID`. Para preview local com API HTTP, iniciar o comando de preview com `NODE_ENV=development` (o bundle já é de produção); a validação HTTPS permanece obrigatória no ambiente hospedado. Para preview em 4173, a API precisa de `WEB_ORIGIN=http://localhost:4173`; origem diferente deve ser recusada.

## Sessão, rascunhos e testes

O proxy encaminha cookies de primeira parte sem expor o destino ao cliente. `WEB_ORIGIN` também define o endereço público dos links de recuperação. Não configurar origem de API como origem pública de autenticação. Respostas privadas usam `no-store`.

O rascunho anônimo usa `enlace:draft:anonymous:v1`; os remotos têm prefixo isolado por conta e projeto. Nenhum token é armazenado junto do rascunho. JSON permite backup manual; PNG não faz upload. Logout limpa a recuperação local da conta.

Para testes PostgreSQL, defina `TEST_DATABASE_URL` e execute `pnpm test`. Sem a variável, suites integradas são explicitamente ignoradas; isso não comprova persistência. A CI inclui serviço PostgreSQL 17. Testes usam somente contas/dados fictícios, incluindo captura local de recuperação de senha sem envio externo.

## Migrações e permissões

Schema de autenticação em `apps/api/src/auth-schema.ts`; negócio em `apps/api/src/db/schema.ts`; SQL e metadata em `apps/api/drizzle`. Rever SQL e migração anterior antes de aplicar. O runner usa lock e registro de aplicação, transação e credencial separada. Não executar `drizzle-kit push` no ambiente de produção.

`apps/api/drizzle/roles.sql` é preparação administrativa explícita, não migração automática: roles sem login, associação às credenciais fora do repositório. A credencial de runtime deve ser NOSUPERUSER/NOCREATEDB/NOCREATEROLE e ter somente DML nas tabelas da aplicação, sem alteração do registro de migrações. Migrações devem criar objetos sob a role de migração para os grants padrão valerem. Validar privilégios efetivos antes de publicar.

## Vercel e Railway

Vercel: Root Directory `apps/web`, acesso a fontes externas do workspace, Framework Preset SvelteKit, Output Directory sem override. `apps/web/vercel.json` instala pela raiz e executa `build:vercel`. Configurar `API_ORIGIN` HTTPS da API. Não colocar `DATABASE_URL` na Vercel.

`STATIC_BUILD_NO_OUT_DIR` após sucesso do adaptador indica frequentemente Root Directory na raiz; a saída correta fica em `apps/web/.vercel/output`. Corrigir Root Directory e refazer deploy sem cache quando publicação for autorizada.

Railway: raiz do repositório, Railpack, `railway.toml`, Node 24, build/start da API, `/health`. Configurar `NODE_ENV`, `WEB_ORIGIN`, segredo e PostgreSQL privado no mesmo ambiente/região. Revisar o Dockerfile raiz adicionado em paralelo pelo usuário antes de publicar; ele não define o build desta API. Migração deve ocorrer em etapa própria com credencial separada e conectividade privada.

`/health` confirma processo; `/ready` verifica `SELECT 1`. Validar cookies, origem e links de recuperação através da hospedagem real antes do aceite remoto. Limitação atual: contadores de autenticação são compartilhados por endpoint, pois cabeçalhos IP externos não são confiáveis. Definir cadeia de proxies confiável e proteção por cliente antes da exposição pública.

Região, orçamento, domínio, SMTP real, backup/restauração e publicação continuam pendentes. Evidências e limites em [validação fase 3](validacao-fase3.md).

