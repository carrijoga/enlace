# ADR-0003 — Frontend na Vercel e API na Railway

Data: 07/11/2026. Status: aceita, base implementada localmente. Substitui o recorte de aplicação única/hospedagem do ADR-0002; preserva Svelte/TypeScript, SVG e PostgreSQL.

## Contexto e decisão

O usuário definiu frontend na Vercel e backend na Railway e autorizou a base executável. Também pediu subagents com modelos mais básicos para economizar tokens. A separação de hospedagens justifica dois apps, mantendo um único repositório e instalação.

- `apps/web`: SvelteKit + Svelte + TypeScript, com `@sveltejs/adapter-vercel`. Páginas e interação no navegador; nenhuma conexão com o banco.
- `apps/api`: Hono + TypeScript em Node.js, com `@hono/node-server`, na Railway. Único backend de negócio e cliente do PostgreSQL privado.
- `packages/contracts`: schemas Zod e formatos portáteis consumidos pelos dois apps. Compilar antes dos consumidores; observar alterações no desenvolvimento conjunto.
- Workspace pnpm, sem orquestrador adicional. Node LTS 24.22.1, pnpm 12.18.0 e versões registradas nos manifests/lockfile. `nodeLinker: hoisted` reduz links de dependências e facilita interoperabilidade com ferramentas de empacotamento.
- Drizzle e `pg` integram a API. Better Auth continua recomendado para a fase de contas, sem instalação, esquema ou sessões implementados.

## Transporte entre frontend e API

O navegador usa URLs relativas no frontend. Nesta base, somente `GET /api/health` existe como transporte fixo para `GET /health` da API, via `API_ORIGIN` exclusiva do servidor. A rota valida o contrato, não armazena dados e não recebe uma URL de destino do navegador.

As futuras rotas de projetos e autenticação usarão origem única, com transporte controlado e testes de cookies/origem, evitando depender de cookies de terceiros entre os domínios padrão das hospedagens. Sessão, autorização, limites e persistência continuam na API; a Vercel não será um segundo backend de negócio. Esse transporte futuro ainda precisa ser implementado.

## Escopo desta implementação

Healthcheck, readiness, configuração de ambiente, pool PostgreSQL sob demanda, tela inicial com prévia por fileiras, exemplo fictício, importação JSON v1/v3 e download do novo contrato. Testes, tipos, lint, formatação, build, medição de JavaScript e configuração de CI.

Ainda não implementados: editor completo, geometria migrada, autenticação, salvamento remoto, CSV, PNG e schema/migrações de negócio. A conexão real ao PostgreSQL é verificada por `/ready` ou `db:check` quando houver um banco disponível; a tela inicial não depende disso para abrir.

## Consequências

Dois serviços e um contrato compartilhado, sem Redis, filas ou coedição. Deploys independentes exigem compatibilidade entre versões de API e frontend; não mudar contratos publicados de forma incompatível sem versionamento.

`railway.toml` e `apps/web/vercel.json` preparam o deploy. Nenhuma hospedagem foi provisionada ou publicada. Builds locais e CI não substituem a validação futura com domínio, proxy, banco e sessões reais. O `railway.toml` foi substituído por `.railway/railway.ts` no [ADR-0013](0013-infraestrutura-railway-como-codigo.md).

No Windows deste ambiente, o adaptador Vercel não conseguiu criar os links simbólicos de funções. O comando padrão gera o build de produção para preview local, sem adaptador nessa plataforma. `build:vercel` exige o empacotamento completo, usado pela Vercel e pela CI Linux; não declarar esse pacote validado localmente. Não alterar permissões do Windows nem modificar o adaptador para contornar a limitação.

## Referências

- [SvelteKit na Vercel](https://svelte.dev/docs/kit/adapter-vercel).
- [Hono no Node.js](https://hono.dev/docs/getting-started/nodejs).
- [Railway: configuração por código](https://docs.railway.com/config-as-code/reference).
