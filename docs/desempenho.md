# Desempenho e facilidade de uso

Atualizado em 07/11/2026. **Status: metas do produto e primeira medição do editor local.** Frontend SvelteKit/TypeScript na Vercel; API Hono/Node e PostgreSQL privado na Railway. Landing: 37,69 KiB gzip; editor: 77,55 KiB. Troca de formato no desktop local: p95 12,1 ms no cenário comum e 92,1 ms no limite, acima da meta de 50 ms. Condições, amostras e pendências na [validação da fase 2](validacao-fase2.md). Não ampliar o orçamento para acomodar o desvio.

O resultado esperado é abrir o projeto rapidamente, editar a planta sem esperar a rede e encontrar as ações principais com facilidade. A escolha de framework ajuda a controlar o custo inicial, mas não comprova desempenho: tamanho entregue, renderização, consultas e comportamento em celular serão medidos na aplicação real.

## Regras para manter a aplicação leve

- Usar SVG nativo e funções puras para a geometria. Não adicionar biblioteca de canvas, motor gráfico ou framework de editor para desenhar as cadeiras atuais.
- Começar com estado local do editor e recursos do Svelte; adicionar bibliotecas de estado apenas quando resolverem uma dificuldade concreta.
- Carregar parser CSV e código de geração de imagens sob demanda, quando a pessoa iniciar a operação. Esses recursos não devem aumentar o JavaScript inicial de quem apenas abre e edita um projeto.
- Manter Drizzle, `node-postgres`, autenticação do Better Auth e credenciais no servidor. Não entregar o cliente do banco ao navegador.
- Preferir CSS e componentes próprios simples. Avaliar cada dependência por necessidade, tamanho entregue e manutenção; não duplicar bibliotecas para a mesma função.
- Vercel Web Analytics (`@vercel/analytics`) é a única medição de terceiros no navegador: `inject()` no layout raiz, só no browser. Não usar `@vercel/analytics/sveltekit`, que depende de `$app/environment`/`$app/stores`, removidos no SvelteKit 3. Coleta só ocorre com Web Analytics ativado no projeto Vercel.
- Introduzir Redis, filas, Web Workers ou virtualização somente após medir um problema que os justifique.
- Limitar snapshots de desfazer, rascunhos e arquivos de entrada. Revogar URLs temporárias e liberar recursos de exportação depois do uso.

## Metas iniciais

As metas abaixo são orçamentos de engenharia ajustáveis, não resultados obtidos nem garantias de tempo em qualquer aparelho. Fixar aparelhos e condições de referência na primeira medição; mudanças de orçamento devem ser justificadas no registro de decisões.

| Área | Meta inicial | Como verificar |
| --- | --- | --- |
| JavaScript inicial do editor | Até 150 KiB gzip | Somar todos os chunks de JavaScript necessários à primeira abertura da rota, incluindo os compartilhados. Medir build de produção, com cache vazio; excluir apenas recursos carregados após ação explícita. |
| Resposta das ações locais | p95 até 50 ms | Medir do início do comando até o primeiro quadro que mostra seu resultado, no aparelho de referência. Cobrir seleção, mover/trocar lugar, editar quantidades e filtrar convidados. |
| Rede durante edição | Sem requisição necessária para selecionar ou mover uma pessoa | Conferir painel de rede e editar com a conexão indisponível. O salvamento posterior pode usar rede; a resposta visual local não depende dele. |
| Salvamento | No máximo uma requisição de gravação em andamento por projeto | Executar alterações rápidas e verificar agrupamento, revisão, fila e estados de pendência/erro. |
| Exportação | Planta inteira, sem congelamento prolongado ou crescimento de memória a cada repetição | Medir duração e comportamento da interface durante PNG geral e individual; repetir para observar liberação de recursos. Definir orçamento numérico após a primeira medição. |

O cálculo do p95 precisa de uma sequência repetida de ações, não de uma única tentativa. Registrar quantidade de amostras e método; uma leitura do relógio ao redor do comando síncrono, sem observar atualização visual, não mede a resposta completa.

## Dados e cenários de referência

Usar somente dados sintéticos. Preparar dois projetos reproduzíveis:

1. Projeto comum com cinco fileiras, 55 cadeiras e participantes distribuídos.
2. Projeto no limite inicial: 12 fileiras, 12 cadeiras por lado/fileira, 288 cadeiras no total e 300 convidados, incluindo nomes longos e acentuados.

Executar nos formatos tradicional e meia-lua, com lados assimétricos e ocupação completa. Verificar em um desktop e em um celular de referência. Emulação pode complementar o diagnóstico, mas deve ser identificada e não substitui a verificação de toque e memória em aparelho real.

Medir abertura com cache vazio e navegação posterior separadamente. Registrar carregamento da rota e do projeto, edição local, salvamento, prévia CSV e exportações. Usar rede controlada ou informar suas condições; distância até a região da aplicação/banco afeta a espera por dados.

## Servidor e PostgreSQL

- Manter API e banco na mesma região quando disponível e usar a rede privada entre os serviços da Railway. O frontend Vercel não conecta ao banco.
- Reutilizar um pool limitado de conexões por processo; calcular o limite considerando a quantidade de instâncias e reservar capacidade para migrações/administração.
- Indexar os acessos por proprietário/projeto e as referências utilizadas nas atribuições. Confirmar os planos das consultas críticas com dados sintéticos antes de acrescentar índices especulativos.
- Listar projetos com metadados e paginação, sem carregar a planta e os convidados de todos os projetos. Carregar o agregado completo somente ao abrir o projeto escolhido.
- Evitar uma consulta por convidado/cadeira. Ler um snapshot consistente e gravar alterações correlacionadas numa transação com controle de revisão.
- Agrupar o autosave com debounce e gravações serializadas. Não salvar cada evento de movimento do ponteiro nem anunciar sucesso antes da confirmação do servidor.
- Não usar cache compartilhada de conteúdo privado sem chave e autorização corretas. Leveza não justifica remover validação, isolamento de contas ou proteção contra conflitos.

## Facilidade de uso como critério de aceite

- A pessoa consegue configurar a planta, adicionar/importar convidados e atribuir lugares sem navegar por telas administrativas para cada alteração.
- As ações frequentes ficam visíveis e próximas da planta; operações menos frequentes podem abrir controles sob demanda.
- Selecionar pessoa/cadeira funciona por toque e teclado, além de arrastar. Rótulos explicam ações e o lugar selecionado permanece identificável.
- Mostrar claramente alterações pendentes, salvo, falha e conflito. Uma falha não apaga o trabalho nem exige repetir o fluxo inteiro.
- Importações apresentam prévia e correções úteis; imagens podem ser baixadas quando o compartilhamento nativo não existe.

## Registro e rotina de verificação

No primeiro build do editor, registrar data, revisão do código, versões, aparelho, navegador, rede, região, conjunto de dados e valores medidos em um relatório ligado à memória. Separar medições locais de medições do ambiente hospedado. A fase 1 registrou apenas tamanho compilado da tela base e inspeção visual em navegador desktop/emulação mobile; não é uma baseline de edição em aparelho real.

Repetir a verificação quando houver mudança relevante no editor, dependências, carregamento ou persistência. Investigar regressões antes de ampliar os orçamentos. Uma pontuação de ferramenta isolada ou o nome do framework não substitui o fluxo real de editar, salvar, reabrir em outro dispositivo e exportar a planta.
