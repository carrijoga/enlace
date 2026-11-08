# Desenvolvimento e preparação de hospedagem

Base da fase 1, 07/11/2026. Sem deploy, contas ou migrações de negócio executados.

## Ambiente e comandos

Usar Node 24.22.1 e pnpm 12.18.0. Instalar pela raiz com `pnpm install --frozen-lockfile`. O lockfile do pnpm 12 contém dois documentos YAML (boot do gerenciador e dependências do workspace); não remover a primeira seção nem editar versões manualmente no lockfile.

| Comando na raiz | Efeito |
| --- | --- |
| `pnpm run dev` | Compila e observa contracts; inicia web em 5173 e API em 3001 |
| `pnpm run dev:web` / `dev:api` | Compila contratos e inicia somente o app escolhido |
| `pnpm run check` | Compila contratos e verifica tipos dos pacotes |
| `pnpm run lint` / `format:check` | ESLint / Prettier |
| `pnpm run test` | Testes Vitest de API, transporte e JSON |
| `pnpm run build` | Contratos, API e frontend; no Windows, saída web para preview local |
| `pnpm run build:api` | Contratos e API, sem precisar do frontend |
| `pnpm run build:vercel` | Contratos e pacote completo do adaptador Vercel |
| `pnpm --filter @enlace/web run preview` | Serve o build web local em 4173 |
| `pnpm run measure:web` | Soma gzip dos chunks iniciais da rota `/` e verifica meta de 150 KiB |

Ao editar contratos com somente um app em execução, compile-os novamente ou mantenha `pnpm --filter @enlace/contracts run dev` em outro terminal. O comando conjunto já faz isso.

O adaptador Vercel exige links simbólicos de funções e falhou com EPERM neste Windows. O build padrão aqui compila/prerenderiza para o preview, sem empacotar o adaptador. A CI Linux e a configuração Vercel exigem `build:vercel`; ainda não foram executadas remotamente. Não é necessário mudar permissões do sistema para trabalhar localmente.

## Variáveis e PostgreSQL local

O editor local está em `/editor`; `/` é a landing. Ambos funcionam sem banco e sem API para editar. O rascunho fica na chave `enlace:draft:anonymous:v1` do localStorage da origem; porta/domínio diferentes têm rascunhos diferentes. Use exportar/importar JSON para transportar dados até existir conta/sincronização. `packages/domain` precisa ser compilado junto com contracts; os scripts da raiz já incluem ambos. A geração de PNG carrega sob demanda e não faz upload.

Os exemplos contêm apenas valores fictícios. Copie os exemplos somente se o destino ainda não existir:

```powershell
if (!(Test-Path apps/web/.env)) { Copy-Item apps/web/.env.example apps/web/.env }
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

| App | Variável | Uso |
| --- | --- | --- |
| Web | `API_ORIGIN` | Origem da API no servidor. Local: `http://localhost:3001`; obrigatória e HTTPS em produção. Não usar prefixo público. |
| API | `PORT` | Porta Railway ou 3001 local |
| API | `WEB_ORIGIN` | Origem exata permitida pelo CORS; local `http://localhost:5173`, HTTPS em produção |
| API | `DATABASE_URL` | Conexão PostgreSQL exclusiva da API; obrigatória em produção |
| API | `NODE_ENV` | `development` local; `production` na Railway |

A API carrega `.env` pelo Node; a configuração Vite carrega o `.env` local da web com a API nativa do Node, preservando variáveis já definidas no ambiente. Em produção, configurar as variáveis nas hospedagens. Reiniciar o processo ao mudar essas configurações.

Com Docker Desktop/daemon em execução:

```powershell
pnpm run db:up
pnpm run db:check
pnpm run db:down
```

PostgreSQL 17 fica em `127.0.0.1:5432` com volume nomeado. Os scripts usam explicitamente `docker-compose.yml`, pois outros arquivos Compose foram adicionados durante o trabalho e foram preservados. `db:down` apenas para o serviço, preservando o volume. O daemon Docker não estava ativo nesta sessão; não foram executados container, conexão real ou migrações.

`GET /health` verifica o processo da API sem depender do banco. `GET /ready` executa `SELECT 1`, devolvendo 200 quando disponível e 503 sem expor detalhes quando não configurado/indisponível. Health positivo não comprova autenticação ou persistência de projetos.

## Configurações de futuro deploy

Vercel: selecionar `apps/web` como Root Directory e permitir fontes do workspace fora desse diretório. `apps/web/vercel.json` instala pela raiz e executa `build:vercel`. Definir `API_ORIGIN` como a origem HTTPS da API Railway. Não colocar `DATABASE_URL` na Vercel.

Railway: raiz do repositório como diretório de build; `railway.toml` declara Railpack, compila contracts + API, inicia somente a API e usa `/health`. Configurar Node 24, `NODE_ENV`, `WEB_ORIGIN` e a `DATABASE_URL` privada do PostgreSQL no mesmo ambiente/região. Antes de publicar, revisar a detecção do `Dockerfile` raiz acrescentado paralelamente: ele não faz parte da configuração da API desta entrega e pode influenciar a seleção de builder. Não aplicar a configuração Vercel à API. Região, orçamento e recursos seguem pendentes.

O proxy da web implementa somente `/api/health` com destino fixo. Antes da fase de contas, desenhar/testar o transporte de autenticação e projetos com cookies de primeira parte, origem, limites e erros. Não expor um proxy para destinos arbitrários.

## Processo de futuras migrações

A fase 1 prepara driver, pool e Drizzle, sem inventar tabelas ou migrações vazias. Na fase 3: escolher/gerar o schema de autenticação compatível; definir tabelas e constraints do modelo; adicionar Drizzle Kit e scripts de geração/aplicação; revisar SQL; aplicar primeiro em PostgreSQL local/teste; ensaiar isolamento/transações; então configurar migração pré-deploy com credencial separada, timeout e compatibilidade com a versão em execução. Não rodar migração por requisição ou durante build que não tem rede privada.
