# ADR-0001 — Documentação, memória e coordenação

Data: 07/11/2026. Status: aceita. Origem: regras explícitas do usuário na criação do projeto.

## Contexto

O protótipo pessoal será transformado em um produto. O trabalho precisa continuar entre sessões e permitir agents paralelos sem perder decisões ou duplicar alterações.

## Decisão

- Manter instruções permanentes em `AGENTS.md` e estado atual em `MEMORY.md`.
- Registrar visão em `PRODUCT.md`, proposta técnica e modelo em `docs/` e sequência em `docs/roadmap.md`.
- Documentar decisões duráveis com status explícito neste diretório.
- Usar subagents para tarefas independentes, com arquivos/responsabilidades definidos antes de iniciar.
- Designar o coordenador como escritor da memória durante execução paralela e responsável pela integração e validação final.
- Atualizar os documentos afetados na mesma entrega de mudanças relevantes.

## Consequências

Agents conseguem retomar o trabalho pela memória e encontrar a justificativa das decisões. Há manutenção documental a cada etapa; por isso cada documento tem responsabilidade própria. O diagnóstico recebido permanece histórico, enquanto a memória relata o estado atual. Recomendações técnicas continuam identificadas como propostas até sua adoção.
