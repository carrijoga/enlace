# ADR-0004 — Landing, editor local e marcos no Git

Status: aceito. Data: 07/11/2026. Origem: orientação explícita do usuário nesta entrega.

## Decisão

`/` é a landing page; o trabalho de planejamento fica em `/editor`. A fase 2 migra a atividade real do protótipo para componentes Svelte, sem exigir conta. A identidade “Papel e jardim” continua, com planta SVG e controles nativos. Geometria, IDs e invariantes ficam em `packages/domain`, independentes da UI e da persistência.

O editor usa snapshots imutáveis e histórico limitado a 35 alterações, rascunho anônimo por navegador e exportação JSON portátil. Estado transitório não entra no arquivo. Alterações estruturais que desocupam cadeiras exigem confirmação e preservam a lista de convidados. Rascunho inválido não é sobrescrito sem ação explícita de recuperação. A imagem individual usa apenas o nome do destinatário, sua cadeira e a geometria neutra, sem nomes, categorias ou ocupação dos demais. (Ampliado pela [ADR-0010](0010-cartao-de-exportacao-da-planta.md): a imagem individual também mostra o casal e a data.)

Contas e acesso entre dispositivos serão implementados com autorização no servidor e PostgreSQL na fase 3. Rascunho local não satisfaz esse requisito e não é apresentado como nuvem. CSV fica na fase 4.

## Commits e coordenação

Registrar entregas funcionais coesas em commits locais; fases são marcos, não uma obrigação de acumular tudo num commit gigante. A fase 1 foi registrada em `91fab30`; o domínio da fase 2 em `60f3298`. Branch de implementação: `codex/ceremony-editor`. Publicação e push não são efeitos colaterais desta entrega.

Subagents econômicos ficam com áreas exclusivas: domínio, arquivos/exportações, painéis, medição e revisão/documentação visual. O coordenador integra e mantém a memória. Arquivos Docker/VS Code criados paralelamente pelo usuário ficam preservados fora destes commits.

## Consequências

A pessoa já pode planejar localmente e manter backups portáteis. Ainda há somente um rascunho anônimo por origem; não há lista de projetos nem sincronização. A fase 3 deve migrar esse estado com isolamento por conta/projeto e revisão concorrente, preservando os comandos de domínio. Limites e medições da fase 2 ficam no relatório de validação.
