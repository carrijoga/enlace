# Revisão de interface — fase 5

Data: 08/11/2026. Escopo: diálogo CSV, painel de convidados, estrutura da cerimônia, planta e rota `/editor`. Revisão focada em acessibilidade, uso móvel, recuperação de erro e limites documentados. Não houve redesign.

## Alterações

- `CsvImportDialog.svelte`: o diálogo agora rola verticalmente dentro da viewport; a tabela mantém rolagem própria e limites menores em celular. As ações ficam visíveis ao rolar no celular. Botões e seletores têm área mínima de toque de 42 px.
- Depois de abrir, o foco inicial vai explicitamente para a escolha do arquivo; o `<dialog>` nativo mantém modalidade, Escape e ciclo de foco. O título e a introdução são associados ao diálogo. A tabela ganhou caption acessível e o resumo que muda com seleção/mapeamento é uma região viva.
- A leitura assíncrona do arquivo expõe estado “Lendo arquivo…”, define `aria-busy` e impede selecionar outro arquivo ou confirmar enquanto lê. Limites e validação existentes continuam sendo aplicados antes de adicionar convidados.

## Verificações e limites

- Medição Node 24.22.1, amostra sintética de 999 registros com cabeçalho e três colunas: 15 ciclos de `parseCsv` + `buildPreview`; mediana 3,61 ms, máximo 17,28 ms. Mede transformação em Node, sem DOM, renderização da tabela, navegador ou tecnologia assistiva. Não é a resposta visual completa.
- `prettier --write` concluiu para o diálogo. `svelte-check` via pnpm ficou sem saída por mais de 90 segundos e foi interrompido; portanto o check de tipos/acessibilidade não foi confirmado. ESLint também não chegou a executar nesse processo.
- A verificação visual e o percurso de teclado em desktop/celular ficaram para a batelada Playwright coordenada pelo root. Ainda não foram verificados leitor de tela, alto contraste, escala de texto ou aparelho físico.

### Primeira passagem Playwright (Edge headless)

- Build de produção local já concluído pelo coordenador, preview em `http://127.0.0.1:4173`, `NODE_ENV=development`. Edge instalado foi controlado pelo pacote Playwright do runtime local.
- `/conta`, `/projetos` e `/editor` responderam HTTP 200 em 1280×900, 390×844 e 320×700; `documentElement.scrollWidth` não excedeu a viewport em nenhuma rota. `/conta` e `/projetos` apresentaram estado de falha de sessão porque o backend local não respondeu (console mostrou 503); esta passagem não usou mock.
- No CSV: foco inicial confirmado no seletor de arquivo; Escape fechou o diálogo. A passagem observou que o foco retornou ao `body`, não ao botão acionador. Correção aplicada: o painel passa o botão acionador à rota e a rota devolve o foco após desmontar o diálogo.
- O script reproduzível e ignorado em `.impeccable/review/phase5-ui.mjs` prepara nova rodada com mocks explícitos para sessão/lista de projetos; inclui nome/e-mail longos, título de 120 caracteres, DELETE 409, CSV de 1.000 linhas nas três viewports, foco/Escape, screenshots e benchmark máximo do editor. Essa confirmação aguarda o novo build do coordenador.

### Auditoria de acessibilidade (axe-core 4.14, regras WCAG 2.0–2.2 A/AA)

Build de produção, Edge headless, 1280×900 e 390×844, API simulada e dados fictícios. Estados: landing, `/conta` anônimo e logado, `/projetos`, editor com exemplo, lista aberta com cadeira selecionada e diálogo CSV. O axe-core ficou fora do repositório. Sem erros de página e sem rolagem horizontal.

Resultado final: nenhuma violação na landing, em `/conta`, em `/projetos` e no diálogo CSV. No editor restam:

- `label-content-name-mismatch` (cadeiras ocupadas: 55 no desktop e 10 no celular): aceito, ver ADR-0009. O nome completo da pessoa está no início do nome acessível; primeiros nomes com mais de 10 caracteres aparecem truncados na planta.
- `target-size` (3, celular): o stepper de uma fileira estava parcialmente coberto pela faixa fixa de aviso no momento da captura. Some ao rolar; não é tamanho real do controle.
- `color-contrast` incompleto: o axe não calcula sobre SVG e fundos sobrepostos. Pares de cor conferidos à parte, por cálculo.

Correções:

- Editor: lista alternativa à planta (`SeatList.svelte`), link "Pular para a planta", uma única parada de Tab na planta, categoria no nome da cadeira, `aside` aninhados removidos, `role="alert"` e `aria-invalid` nos erros de convidado, grupo nomeado nos filtros, textos de 8–10 px elevados a 11 px no celular.
- Contraste: textos da planta de 3,9–4,4:1 para 5,3:1; contorno de campos de 1,6–1,9:1 para 3,4:1 com `--field-line`; número dos passos da landing de 3,9:1 para 5,3:1.
- Conta e projetos: mensagens em regiões vivas persistentes, erro sem depender só de cor, foco preservado ao trocar de modo, ao excluir e ao renomear, `autocomplete` correto na redefinição, alvos mínimos de 24 px.
- `minlength` do cadastro e da redefinição alinhado aos 12 caracteres exigidos pelo servidor (antes 8).

Fora do critério automatizado: as cadeiras ocupadas e vazias mantêm contorno abaixo de 3:1, pois o texto interno já as identifica; a caixa de seleção de 16 px tem espaçamento suficiente. Automação cobre parte dos critérios: leitor de tela real, zoom de 200%, alto contraste e comando de voz seguem sem verificação.

## Observações da auditoria

- A tabela com até 1.000 linhas continua deliberadamente sem virtualização: a entrada é limitada a 1 MiB/1.000 linhas, e esta revisão mediu somente o custo dos dados. A renderização real precisa ser observada na batelada visual; se ficar pesada, medir antes de introduzir virtualização.
- A planta usa botões SVG focáveis e navegação por setas; estrutura usa landmarks, rótulos e controles nativos. A inspeção estática não substitui validação com teclado e leitor de tela.
