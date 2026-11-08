# Registro de decisões

Atualizado em 08/11/2026. Use ADRs numerados com contexto, decisão, status e consequências. Status possíveis: proposta, aceita, substituída ou rejeitada. Um documento de arquitetura proposto não é uma implementação.

| Registro | Status | Referência |
| --- | --- | --- |
| 0001 — Memória, documentação e coordenação entre agents | Aceita: instrução explícita do usuário | [ADR-0001](0001-documentacao-e-coordenacao.md) |
| 0002 — Railway, PostgreSQL e SvelteKit/TypeScript | Parcialmente substituída pelo ADR-0003 | [ADR-0002](0002-railway-postgres-e-stack-enxuta.md) |
| 0003 — Frontend Vercel e API Railway | Aceita; base local implementada | [ADR-0003](0003-frontend-vercel-api-railway.md) |
| 0004 — Landing, editor local e marcos no Git | Aceita; editor local implementado | [ADR-0004](0004-editor-local-e-marcos-git.md) |
| 0005 — Comandos do domínio com compartilhamento estrutural | Aceita; implementada | [ADR-0005](0005-comandos-com-compartilhamento-estrutural.md) |
| Drizzle/`pg`; Better Auth para contas | Driver/pool implementados; autenticação ainda planejada | [Arquitetura](../arquitetura.md) |
| Aplicação Next.js/React com Supabase | Proposta inicial descartada após orientação do usuário | [ADR-0002](0002-railway-postgres-e-stack-enxuta.md) |
| Planta JSONB, convidados/atribuições relacionais e revisão transacional | Proposta técnica | [Modelo de dados](../modelo-de-dados.md) |
| SVG e exportação de imagens no cliente | Implementados no editor local | [Validação fase 2](../validacao-fase2.md) |
| Migração incremental com compatibilidade do JSON legado | Direção de planejamento | [Roadmap](../roadmap.md) |

O ADR-0003 registra a direção atual. Antes de adicionar integrações, validar e fixar versões compatíveis; mudanças relevantes de direção exigem atualizar o registro. Não é necessário interromper o trabalho para escolhas rotineiras já autorizadas pelo escopo; documente a decisão e avance.

Não decididos: região e recursos na Railway, orçamento, transporte de e-mail, versões das integrações, identidade visual final, domínio público, modelo comercial, colaboração entre contas e suporte a múltiplos cenários dentro do mesmo projeto.
