# Validação da fase 5 — preparação local

08/11/2026. Windows, Node 24.22.1, PostgreSQL 17 via Compose local. Dados sintéticos. Moto G84 definido pelo usuário como referência móvel; ainda sem medição no aparelho. Nenhum deploy, provisionamento ou envio de e-mail externo.

## Entrega

- Exclusão de conta por Better Auth com senha exigida no hook do servidor, confirmação explícita na UI, cascata de projetos/convidados/atribuições/recibos e invalidação de sessões. Redirecionamento após login restrito à origem da aplicação.
- Importação JSON conserva IDs de projeto/operação e corpo em falhas ambíguas, inclusive ao recarregar quando o armazenamento local está disponível. A ação pendente impede iniciar uma segunda importação até confirmar a primeira.
- Erros de exclusão de projeto dentro do diálogo, bloqueio contra submissões concorrentes, erro de carregamento distinto de lista vazia, links de conta e textos sobre limpeza ao sair.
- Diálogo CSV com rolagem contida, resumo acessível, foco inicial, retorno de foco ao fechar e leitura sinalizada. [Revisão de UI](revisao-ui-fase5.md).
- Logs HTTP sem conteúdo privado; analytics remove parâmetros/fragmentos e exclui conta/projetos. Scripts de backup em arquivo novo e restauração somente em destino descartável confirmado. [Operação](operacao.md).

## Evidências automatizadas

A suíte com PostgreSQL, `TEST_CREATE_DATABASE=1`, `--maxWorkers=2 --testTimeout=30000` verificou 129 testes. A primeira repetição encontrou uma revisão fixa incorreta no novo teste de exclusão; corrigida para ler a revisão atual antes de escrever. Reexecução do arquivo integrado: 7/7 aprovados. Os demais 122 já haviam passado, incluindo migrações reproduzíveis, concorrência, isolamento, CSV e saneamento de analytics.

A primeira execução com paralelismo padrão sofreu timeouts de cinco segundos no teste de migração e exclusão; esses resultados não foram tratados como aprovação. O timeout encerrou o schema antes do fim de uma requisição; a repetição com recursos limitados confirmou o comportamento real.

Rodada final, após a auditoria de acessibilidade: `pnpm run check` com 425 arquivos, 0 erros e 0 avisos; lint e formatação aprovados; build local concluído; 131 testes aprovados em 18 arquivos com PostgreSQL, `TEST_CREATE_DATABASE=1`, `--maxWorkers=2 --testTimeout=30000`. Sem esses limites, 4 testes integrados estouraram 5 s, como na primeira execução acima. O novo `createUuid` tem teste do caminho sem `randomUUID`. `build:vercel` não foi executado (Linux/CI).

JavaScript inicial em produção: landing 39,31 KiB e editor 85,03 KiB gzip, abaixo de 150 KiB. O editor aumentou 1,3 KiB desde a fase 4.

Benchmark do cenário máximo (288 cadeiras, 300 convidados, modo `frame`, 20 amostras/ação, Edge headless, 1280×900), quatro rodadas no mesmo build. A rodada mais limpa ficou com formato 25,1; cadeira 15,9; pessoa 13,9; troca 27,3; filtro 18,8 e busca 17,6 ms de p95. As outras variaram muito, com pior p95 de 41,9 ms, 73,8 ms e, na última, picos de até 1,8 s em todas as ações, quando a máquina estava ocupada. Não é aceite de desempenho nem comparação A/B: mostra só que a meta continua alcançável neste build. `scripts/bench-editor.js` foi corrigido porque o `pagehide` do editor sobrescrevia o rascunho sintético ao recarregar.

## Navegador

Playwright com Microsoft Edge instalado, preview de produção local em 4173. Importação com API simulada: a primeira chamada falha, a página recarrega e a retentativa repete exatamente o mesmo JSON de requisição; a ação de iniciar outra importação fica bloqueada. Isso valida recuperação do cliente, não substitui os testes reais de idempotência do backend.

Fluxos da lista alternativa, com `randomUUID` removido para simular HTTP na rede local, em 1280×900 e 390×844: adicionar pessoa, posicioná-la pela lista mantendo o foco nela, esvaziar a cadeira pelo seletor embutido, uma única parada de Tab na planta e link "Pular para a planta". O retorno de foco em `/conta` e `/projetos` foi revisado no código, sem percurso no navegador.

Verificações visuais e de teclado em [revisão de UI](revisao-ui-fase5.md). O detector Impeccable foi executado uma vez sobre as superfícies alteradas e apontou divergências consultivas de cores/tipografia em relação aos tokens documentados. A identidade existente foi preservada; o detector não representa certificação WCAG.

## Aceite ainda pendente

- Fluxo completo hospedado Vercel/Railway: pacote Linux `build:vercel`, HTTPS/cookies/origem, proteção de abuso por cliente e privilégios reais de runtime/migração.
- SMTP real e recuperação de acesso com entrega de e-mail. Os testes locais capturam o transporte sem envio.
- Moto G84: navegador/versão, toque, desempenho p95 e reabertura entre dispositivos reais. Não classificar emulação como medição física.
- Leitor de tela, zoom/alto contraste abrangentes, impressora física e repetição de exportações com perfil de memória.
- Ensaio real de backup/restauração com dados fictícios: os scripts só têm testes unitários e esta máquina não tem `pg_dump`/`pg_restore` no `PATH`.
- Região, recursos, orçamento, domínio, retenção de backups e registros, agenda/alertas e restauração na infraestrutura escolhida.

A fase 5 não está declarada concluída: esta entrega cobre preparação e evidências locais. O próximo passo é configurar um ambiente de teste aprovado e executar os critérios acima com dados fictícios.
