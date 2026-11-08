# ADR-0002 — Railway, PostgreSQL e aplicação enxuta

Data: 07/11/2026. Status: parcialmente substituída pelo [ADR-0003](0003-frontend-vercel-api-railway.md). A decisão posterior separa frontend Vercel e API Railway; este registro preserva o contexto da escolha de Svelte/TypeScript e PostgreSQL.

## Contexto

Após a proposta inicial, o usuário determinou que não será usado Supabase, que a hospedagem será na Railway e que PostgreSQL pode ser adotado. Também priorizou um produto rápido, leve e fácil de usar, permitindo optar por frameworks mais leves.

Railway e PostgreSQL são decisões explícitas do usuário. A escolha de SvelteKit é uma decisão técnica do projeto para atender a essa orientação; não foi uma preferência de framework declarada pelo usuário.

## Decisão

- Hospedar uma única aplicação web/backend Node.js na Railway e usar PostgreSQL em um segundo serviço privado.
- Adotar SvelteKit + Svelte + TypeScript com `@sveltejs/adapter-node` para o bootstrap, substituindo a recomendação Next.js/React.
- Recomendar Drizzle + `node-postgres` para acesso SQL, pool e migrações; Better Auth para autenticação com sessões no banco. Validar compatibilidade e fixar versões antes de adicionar essas integrações.
- Manter SVG, CSS e reatividade nativos para o editor, com domínio independente do framework. Carregar ferramentas de importação/exportação quando usadas.
- Autorizar operações no backend pelo usuário da sessão e proprietário do projeto. O navegador não terá credenciais nem acesso direto ao banco.
- Executar alterações do projeto em uma transação de aplicação com controle de revisão. Não transportar `auth.uid()`, papéis ou RPC específicos da proposta descartada para PostgreSQL comum.
- Manter metas de desempenho mensuráveis em [desempenho.md](../desempenho.md). A escolha do framework é uma hipótese de boa adequação; o produto deve comprovar o desempenho em build de produção e dispositivos de referência.

## Alternativas consideradas

| Alternativa | Avaliação para este projeto |
| --- | --- |
| Next.js + React | Viável; proposta inicial substituída para priorizar uma base com componentes compilados e reatividade nativa. Não foi medida uma aplicação de cada stack. |
| SvelteKit | Escolhido: editor reativo, páginas e backend no mesmo projeto, com deploy Node. |
| SPA Vite + Fastify/Hono | Viável, mas exige compor e manter a integração frontend/API já no início. |
| Astro | Não escolhido para este editor com estado contínuo; continua adequado a outras classes de página, como conteúdo. |
| JavaScript sem framework | Preserva a simplicidade do protótipo, mas exigiria construir mais infraestrutura de interface, rotas e sincronização conforme o produto cresce. |

## Consequências e limites

O projeto terá responsabilidade por sessões, e-mails de recuperação, autorização, migrações e operação do PostgreSQL; hospedar o banco não fornece autenticação dos usuários do produto. Usar uma biblioteca de autenticação evita criar um mecanismo próprio de credenciais.

Um serviço de aplicação reduz a quantidade inicial de integrações; isso não é uma promessa de custo ou desempenho. Não adicionar Redis, microserviços, biblioteca de canvas ou infraestrutura de coedição sem uma necessidade demonstrada. Preferir interações locais imediatas e salvamento agrupado, preservando a integridade e a recuperação de falhas.

Região, recursos da Railway, orçamento, domínio, transporte de e-mail e versões finais seguem pendentes. Este ADR não provisiona recursos, instala dependências ou publica a aplicação.

## Evidências e documentos relacionados

A [arquitetura](../arquitetura.md) lista as fontes oficiais consultadas para SvelteKit, Railway, Drizzle e Better Auth. O [modelo de dados](../modelo-de-dados.md) e o [roadmap](../roadmap.md) traduzem essa direção em contratos e sequência de trabalho.
