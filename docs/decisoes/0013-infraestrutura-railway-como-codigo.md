# ADR-0013 — Infraestrutura Railway como código

Data: 09/11/2026. Status: aceita pelo usuário; configuração local validada, provisionamento pendente.

## Contexto

O `railway.toml` do ADR-0003 deixou de servir: a Railway descontinuou Config as Code, serviços novos não podem adotá-lo e arquivos existentes deixam de ser lidos em 01/12/2026. A substituta é Infrastructure as Code, em `.railway/railway.ts`.

## Decisão

- `.railway/railway.ts` substitui `railway.toml`, com o SDK oficial `railway` fixado como dependência de desenvolvimento da raiz. A Railway não lê esse arquivo no deploy; mudanças valem após `railway config plan` e `railway config apply`.
- Serviço `api` a partir da branch `main` (escolha do usuário), com `pnpm run build:api` e início direto por `node apps/api/dist/server.js`, para o processo receber SIGTERM.
- Região US East (`us-east4-eqdc4a`) para API e banco, decisão do usuário; a Railway não tem região na América do Sul.
- PostgreSQL fixado em 17 (o padrão do SDK é 18), igual a Compose, CI e utilitários de backup, pelo auxiliar público `database()`, pois `postgres()` não aceita imagem.
- Migrações no pré-deploy, na rede privada e sem `tsx`, por `node apps/api/dist/db/migrate.js`. O runner usa `MIGRATOR_DATABASE_URL` quando existir; a API usa `DATABASE_URL` com credencial restrita.
- `scripts/db-bootstrap-roles.mjs` cria as roles e os logins `enlace_app` e `enlace_deploy` uma vez, com a credencial administrativa, e grava as URLs em arquivo novo, sem imprimi-las.
- Sem domínio próprio nem proxy Cloudflare na API. O navegador só fala com a Vercel, que encaminha `/api/*` por `API_ORIGIN`; o domínio gerado pela Railway basta e os cookies pertencem à origem da web.

## Consequências

O pré-deploy herda as variáveis do serviço, então a credencial de migração fica disponível também ao processo da API; a separação de privilégios vale para o que a API usa, não isola o segredo. O primeiro deploy falha até as variáveis existirem, e isso é esperado na ordem do runbook.

A API continua alcançável pelo domínio gerado. Proteção por cliente segue pendente, e um proxy à frente da API não a resolveria: ele veria o IP da Vercel, não o da pessoa. Domínio próprio, se vier, vai na web e exige atualizar `WEB_ORIGIN`.

O ensaio em contêineres Linux cobriu instalação com `NODE_ENV=production`, build, roles, migração, início e cadastro. Não substitui o build real do Railpack, HTTPS, cookies através da Vercel nem privilégios na hospedagem.

## Referências

- [Railway: Infrastructure as Code](https://docs.railway.com/infrastructure-as-code).
- [Railway: referência de IaC](https://docs.railway.com/infrastructure-as-code/reference).
- [Railway: pré-deploy](https://docs.railway.com/guides/pre-deploy-command).
- [Railway: regiões](https://docs.railway.com/reference/deployment-regions).
