# Validação do editor local — fase 2

Data: 07/11/2026, America/Sao_Paulo. Branch `codex/ceremony-editor`. Base fase 1 `91fab30`; domínio `60f3298`. Entrega funcional local; fase concluída em 08/11/2026 conforme o ADR-0006 (celular de entrada como limite conhecido). Sem push, deploy, conta, banco de negócio ou CSV.

## Implementação verificada

Landing em `/`; editor em `/editor`. Geometria SVG preserva o cálculo esquemático do protótipo, com IDs novos e dados fictícios. Domínio puro e validado controla fileiras, formatos, corredor, convidados e ocupação única. Remover lugares ocupados pede confirmação e mantém os convidados; desfazer/refazer usa 35 snapshots. Seleção, zoom, filtros e histórico não entram no JSON.

Rascunho anônimo por origem, autosave local com debounce de 250 ms e flush no encerramento da página. Falha de armazenamento é visível; rascunho inválido fica preservado até recuperação explícita. JSON v1 e legado v3 passam pelo contrato estrito, com limite de 2 MiB. Importação inválida não troca o projeto. PNG carrega sob demanda, limita a resolução e revoga URLs temporárias. Mapa individual usa geometria neutra e somente nome/cadeira do destinatário: não revela outros nomes, notas, IDs, categorias ou ocupação.

## Verificações automáticas

`pnpm run check` sem erros/avisos Svelte, `pnpm run lint` aprovado, formatação aplicada e 40 testes em sete arquivos aprovados. Testes cobrem contratos/migração, geometria/invariantes/trocas, rascunho/armazenamento e SVG/privacy, além dos testes existentes da API. Build de produção local aprovado. Código não acrescenta bibliotecas gráficas ou de estado.

O build local Windows usa o modo de preview já documentado na fase 1. Empacotamento completo Vercel aguarda Linux/CI devido a symlinks; não confundir preview com deploy validado. API/banco não foram alterados nesta fase.

## Navegador e arquivos reais

Windows, navegador integrado do Codex, servidor local Vite: desenvolvimento em 5173 e preview de produção em 4173. Desktop inspecionado em 1440×1000 e captura válida completa em 1170×900; celular emulado em 390×844, sem overflow horizontal. A planta mobile fica no fluxo da página para não encobrir controles; zoom permite aproximar/panoramizar e Ajustar mostra a visão completa.

Verificados: exemplo fictício, selecionar convidado e atribuir cadeira, trocar ocupantes, cancelar/confirmar remoção de fileira ocupada, desfazer, mudança de formato, setas entre cadeiras e Enter para selecionar. JSON e PNG completo/individual foram baixados de verdade; PNG individual inspecionado. Importação sintética comum e de limite funcionou; versão inválida foi rejeitada preservando a planta; reload reabriu o rascunho máximo. CTA da landing abriu o editor. Impressão possui CSS A4 paisagem, sem ensaio de impressora física. Arrastar possui implementação, mas não foi ensaiado por automação; alternativa por clique/teclado foi verificada.

Capturas e artefatos sintéticos estão em `.impeccable/review/`, ignorada pelo Git: `editor-desktop.jpg`, `editor-mobile.jpg`, `landing-desktop.jpg`, `individual.png`, `full.png`, `full-corrected.png`, `roundtrip.json`, `common.json`, `max.json`, `invalid.json`, `bundle.json`, `common-timing.json`, `max-timing.json`. Não incluem dados pessoais do HTML original. Os downloads de teste do navegador também ficam em Downloads com nomes “minha-cerimonia”.

## Medições de produção

`node scripts/measure-web.mjs` soma gzip por chunk inicial do manifesto e HTML prerenderizado, incluindo imports estáticos compartilhados e excluindo imports dinâmicos após ação. Orçamento de 153.600 bytes por rota:

| Rota | Bytes gzip | KiB gzip | Resultado |
| --- | ---: | ---: | --- |
| `/` | 38.592 | 37,69 | Dentro |
| `/editor` | 79.416 | 77,55 | Dentro |

Benchmark local sem rede remota nem limitação artificial de CPU: 20 trocas alternadas de formato por conjunto, temporizadas desde o início do comando até `tick` + primeiro `requestAnimationFrame`. p95 por nearest rank; não é INP de campo e não mede toda a pintura. Mesmo desktop/IAB, sem caracterização de CPU ou medição em celular físico. Projeto comum: 55 cadeiras/10 convidados, p95 **12,1 ms**. Limite: 288 cadeiras/300 convidados (288 ocupados), p95 **92,1 ms**. O limite excede a meta de 50 ms; a fase permanece em validação. Snapshots imutáveis sem proxies profundos reduziram o custo observado, e mapas derivados retiraram buscas repetidas na lista. Não há nova dependência.

Comum (ms): 13.3, 11, 11.9, 10.3, 10.3, 9.7, 12.1, 9.4, 10.5, 11.2, 12, 8.3, 8.5, 9.2, 10.4, 9.6, 10.3, 9.1, 9.4, 10.5.

Limite (ms): 69.6, 118.3, 58.5, 59.7, 68.8, 54.9, 74.4, 59, 61.4, 71.5, 57.6, 57.4, 63.1, 92.1, 55, 55.4, 56, 55.3, 59.5, 77.8.

Pendências desta rodada (perfil e ações sob carga) foram tratadas em 08/11/2026 — ver seção abaixo. Seguem pendentes: métricas de exportação repetida/memória e cache vazio em hospedagem. Não prometer rapidez em todo aparelho com base neste ensaio. Edição funciona no estado local e não chama API de projeto; não houve simulação de rede offline nesta rodada.

## Perfil e otimização do cenário máximo — 08/11/2026

Ambiente: mesmo desktop Windows, navegador integrado (Claude desktop), build de produção servido por `vite preview`, viewport emulado 1440×900. Dados sintéticos gerados por `scripts/bench-editor.js` (288 cadeiras, 300 convidados fictícios, 288 ocupados). Sem dados pessoais, rede remota ou limitação de CPU.

Benchmark ampliado (`scripts/bench-editor.js`, executado no console de `/editor`): 20 amostras por ação, intervalo de 60 ms entre amostras, p95 por nearest rank. Ações: trocar formato (tradicional ↔ meia-lua), selecionar cadeira, selecionar pessoa na lista, trocar ocupantes (pessoa selecionada + cadeira ocupada), filtro “Sem lugar” e busca. Dois modos de medição:

- `frame`: do início da ação até o primeiro quadro produzido (rAF + tarefa seguinte), inclui pintura. Mais estrito que o método de 07/11 (comando → tick → rAF).
- `layout`: até o Svelte aplicar o DOM e um estilo/layout forçado; **exclui pintura/composição**. Usado porque o painel do navegador ficou oculto durante parte da sessão e, oculto, a página não recebe quadros.

### Diagnóstico

Long Animation Frames e instrumentação de APIs de layout mostraram três causas:

1. Os comandos de domínio devolviam a cópia profunda do Zod; toda edição recriava os 300 convidados e o editor serializava o projeto duas vezes para detectar comando sem efeito. Ver [ADR-0005](decisoes/0005-comandos-com-compartilhamento-estrutural.md).
2. O efeito de centralizar a planta dependia do objeto `geometry`, novo a cada troca de formato, e lia `scrollWidth`: ~37–55 ms de layout síncrono por troca.
3. O SVG da planta tinha largura/altura percentuais; qualquer mudança de geometria dentro dele (texto de uma cadeira, anel de seleção) fazia o Chrome refazer o layout das 288 cadeiras: 14–28 ms por alteração, contra ~5 ms com tamanho definido em pixels. A lista de 300 convidados também era toda recalculada (filtro/busca/seleção).

### Mudanças

- Domínio: `validate` mantém o parse completo, mas devolve o objeto do comando (compartilhamento estrutural); `assignGuest` para a mesma cadeira devolve o próprio projeto; novo `getSeatLabels(layout)` calcula os rótulos uma vez por planta. Quatro testes novos.
- Editor: comparação de “sem efeito” por referência/campos; contagem de pessoas desalojadas com `Set`.
- `PlanCanvas`: efeito de centralização depende só da largura numérica; SVG dimensionado em pixels a partir de `offsetWidth/offsetHeight` da área da planta (ResizeObserver do Svelte), preservando enquadrar/zoom e o mínimo de 760 px no zoom; impressão volta a `height: auto`.
- `GuestsPanel`: rótulos por mapa; linhas da lista com `content-visibility: auto` para que linhas fora da área visível não entrem em estilo/layout.

Nenhuma dependência nova. JS inicial após a mudança: landing 39.793 bytes (38,86 KiB) e editor 80.988 bytes (79,09 KiB) gzip, ambos abaixo de 150 KiB.

### Resultados no cenário máximo (p95, ms)

| Ação | Antes, `frame` (painel visível) | Antes, `layout` | Depois, `layout` — execução 1 | Depois, `layout` — execução 2 |
| --- | ---: | ---: | ---: | ---: |
| Trocar formato | 120,7 | 74,0 | 67,9 | 49,3 |
| Selecionar cadeira | 70,1 | 57,1 | 10,8 | 25,1 |
| Selecionar pessoa | 46,9 | 48,6 | 11,2 | 18,1 |
| Trocar ocupantes | 64,5 | 69,5 | 27,0 | 20,8 |
| Filtro “Sem lugar” | 67,3 | 103,4 | 33,5 | 40,5 |
| Busca | 54,8 | 91,7 | 25,0 | 24,9 |

A coluna “Antes, `layout`” foi medida por engano num servidor de preview que ainda servia o build antigo; serve como baseline no mesmo modo da medição posterior. Com 20 amostras o p95 é a 19ª menor, então dois valores isolados bastam para elevá-lo. Na execução 1, a troca de formato teve medianas de ~21 ms e dois picos (115,2 e 67,9 ms); uma série dedicada de 40 trocas de formato resultou em p95 **23,1 ms** (mediana 20,1, máximo 31,5). Picos isolados de ~100 ms apareceram em ações diferentes nas duas execuções (seleção de pessoa 99,4; filtro 126,6), compatíveis com ruído da máquina compartilhada ou coleta de lixo.

Conclusão: no desktop de referência e no modo `layout`, todas as ações ficaram com p95 ≤ 50 ms na execução 2 e na série dedicada de formato; a execução 1 ficou acima apenas na troca de formato por dois picos. A meta de 50 ms está **atingida no desktop, sem incluir pintura**. A medição `frame` (com pintura) foi repetida depois, com o painel visível, e também ficou dentro da meta (ver subseção seguinte). Falta a medição em celular físico.

Verificação visual após a mudança: desktop 1440×900 com a planta enquadrada (692×576 px dentro de 696×576, sem rolagem) e zoom 130%/150%/Ajustar corretos; mobile emulado 375×812 com zoom 100% mantendo o mínimo de 760 px e rolagem dentro do quadro, sem overflow da página. Testes: 44 em 7 arquivos; `check`, `lint` e `format:check` sem erros.

### Medição com pintura (modo `frame`) — 08/11/2026

Mesmo desktop e build de produção (rebuild antes da medição, preview reiniciado), painel do navegador **visível** (`document.visibilityState = visible`, primeiro quadro em 8,8 ms), viewport 1440×900, cenário 288/300. Duas execuções seguidas de 20 amostras por ação, p95 em ms:

| Ação | Antes, `frame` | Depois, `frame` — execução 1 | Depois, `frame` — execução 2 |
| --- | ---: | ---: | ---: |
| Trocar formato | 120,7 | 29,1 | 31,5 |
| Selecionar cadeira | 70,1 | 16,6 | 17,0 |
| Selecionar pessoa | 46,9 | 18,2 | 17,4 |
| Trocar ocupantes | 64,5 | 27,4 | 22,8 |
| Filtro “Sem lugar” | 67,3 | 37,1 | 36,8 |
| Busca | 54,8 | 33,6 | 32,9 |

Medianas da execução 2: 25,6 / 14,6 / 16,4 / 21,0 / 13,6 / 14,5 ms. Filtro e busca alternam entre ~13 ms (voltar à lista completa) e ~35 ms (aplicar o filtro), por isso o p95 reflete o caso de aplicar. A primeira amostra de cada ação na execução 1 ficou em 36–40 ms (aquecimento). Único pico: um formato de 105,1 ms na execução 2, fora do p95.

Conclusão: **meta de p95 ≤ 50 ms atingida no desktop também com pintura**, em todas as ações e nas duas execuções. Hardware do desktop não caracterizado; sem limitação artificial de CPU.

### Ensaio em celular físico

Página auxiliar `scripts/bench-phone.html` (fora da aplicação; dados fictícios): carrega o projeto 288/300, abre `/editor` num iframe da mesma origem para teste manual de toque e roda o mesmo procedimento do modo `frame`, mostrando p95/mediana/máximo, modelo do aparelho (user agent), tela e memória JS quando o navegador expõe. Procedimento: `pnpm run build`, copiar o arquivo para `apps/web/.svelte-kit/output/client/bench.html`, iniciar o preview com `--host 0.0.0.0` (configuração local `web-preview-lan`) e abrir `http://<IP-do-PC>:4173/bench.html` no celular na mesma rede.

Limite do ensaio na rede local: `http://<IP>` não é contexto seguro, então `crypto.randomUUID` não existe e **adicionar convidado ou fileira falha nesse endereço**. Em produção (https na Vercel) e em `localhost` isso não ocorre; selecionar, trocar, formato, filtro e busca não geram IDs e funcionam. A página auxiliar tem gerador próprio para semear os dados.

Validação da página no próprio desktop, com emulação de celular 375×812 (CPU do desktop, **não substitui o aparelho**): formato 22,7; cadeira 7,7; pessoa 8,2; troca 19,2; filtro 19,9; busca 15,3 ms (p95); 18,5 MiB de heap JS.

#### Celular físico — execução 1 (08/11/2026)

Aparelho Android do usuário, Chrome 156 (user agent reduzido: “Android 10; K”, modelo não informado pelo navegador), tela 509×1130 CSS px @2,125x, janela 508×926, mesma rede local, cenário 288/300, 14,5 MiB de heap JS. p95 (mediana) em ms:

| Ação | p95 | Mediana | Resultado |
| --- | ---: | ---: | --- |
| Trocar formato | 62,0 | 50,9 | Acima |
| Selecionar cadeira | 32,1 | 23,2 | OK (um pico de 121,1 na 1ª amostra) |
| Selecionar pessoa | 29,2 | 22,3 | OK |
| Trocar ocupantes | 46,5 | 43,2 | OK, perto do limite |
| Filtro “Sem lugar” | 57,6 | 50,9 | Acima |
| Busca | 49,4 | 42,8 | OK, no limite |

O celular ficou ~3–4× mais lento que o desktop de referência. Filtro e busca alternam aplicar (~23 ms) e voltar à lista completa (~55 ms): o custo estava em voltar.

#### Diagnóstico e correção após a execução 1

Decomposição no desktop, com largura de 514 px (layout de celular), em script / estilo+layout / restante até o quadro:

- Filtro e busca: o tempo era quase todo script. O `{#each}` sobre a lista filtrada destruía e recriava ~288 linhas a cada mudança (11,2 ms no desktop ao voltar para “Todas”). **Correção:** todas as linhas ficam montadas, agrupadas por categoria a partir da referência de `project.guests`; busca e filtro calculam um `Set` de IDs visíveis e só alternam `hidden` na linha e no grupo. A busca usa um texto normalizado por convidado, calculado uma vez por lista. Resultado no desktop: 2,0 ms (filtro) e 1,2 ms (busca) de script.
- Trocar formato: script 7,5 + layout 5,2 + pintura 6,8 ms. As 288 cadeiras recebiam objetos novos e todas as expressões de cada cadeira eram reavaliadas; o painel de convidados recalculava rótulos e mapas. **Correção:** `PlanCanvas` itera sobre uma lista de cadeiras estável enquanto `rows` não muda; só o `transform` lê o mapa de posições da nova geometria (setas do teclado também usam a posição atual). Mapas de convidados/atribuições e rótulos dependem das referências de `guests`, `assignments` e `rows`. O script caiu para 6,3 ms (2,2 ms são o comando e a validação Zod completa; Zod sozinho ~0,9 ms no Node).
- Layout e pintura da troca de formato vêm sobretudo das 576 legendas SVG (nome e “fileira · cadeira”) em posições e ângulos novos. Ocultar as legendas no diagnóstico cortou o layout de ~4,9 para ~2,4 ms e a pintura de ~7 para ~4,7 ms; outras formas quase não pesam. `text-rendering`, unir as duas legendas num `<text>` com `<tspan>` e deixar o texto fora do grupo girado não ajudaram. Reduzir mais exigiria mudar o desenho das cadeiras.

Após a correção, mesma página auxiliar no desktop a 514 px (`frame`): formato 25,3; cadeira 7,0; pessoa 8,0; troca 18,2; filtro 10,8 (antes 19,9); busca 8,7 (antes 15,3) ms de p95. JS inicial: landing 39.812 bytes (38,88 KiB), editor 81.159 bytes (79,26 KiB). 44 testes, `check`, `lint` e `format:check` sem erros; filtro, busca, contagem por grupo, mensagem vazia e setas após trocar formato conferidos no navegador.

#### Celular físico — execução 2 e comparação A/B (08/11/2026)

Execução 2 (build corrigido, `bench-phone.html`), p95: formato 69,8; cadeira 32,3; pessoa 41,0; troca 64,2; filtro 68,6; busca 66,0 ms. Ações não alteradas (pessoa, troca) também pioraram em relação à execução 1, o que indica variação do próprio aparelho entre execuções (temperatura, economia de energia, apps em segundo plano). Duas execuções em momentos diferentes não bastam para comparar versões.

Comparação A/B no mesmo aparelho e na mesma sessão: página temporária servindo o build anterior (`3.WQqzTAQ2`, HEAD) e o corrigido (`3.CyRU9nlU`) na mesma origem, ordem antigo, novo, novo, antigo, 20 amostras por ação por rodada (40 por versão), sem quadros perdidos. Janela 508×999. p95 (mediana) em ms:

| Ação | Antigo | Novo |
| --- | ---: | ---: |
| Trocar formato | 78,6 (69,1) | 89,3 (65,9) |
| Selecionar cadeira | 41,3 (23,4) | 62,6 (23,4) — um pico isolado; rodada 3: 31,4 |
| Selecionar pessoa | 41,7 (35,9) | 42,2 (37,4) |
| Trocar ocupantes | 63,1 (53,9) | 60,9 (54,5) |
| Filtro “Sem lugar” | 86,1 (51,0) | 68,6 (58,9) |
| Busca | 77,4 (61,0) | 57,1 (47,1) |

Leitura: a correção melhora o pior caso do filtro (antigo alternava ~33 ms ao aplicar e ~83 ms ao voltar; o novo fica em ~45–68 ms nos dois sentidos) e a busca; formato, troca e seleções não mudam além do ruído. A correção é mantida. Neste aparelho, porém, quase todas as ações do cenário 288/300 ficam entre ~50 e ~70 ms de p95 (troca: mediana 54 ms no celular contra ~18 ms no desktop): o aparelho é ~3–4× mais lento que o desktop e varia bastante entre execuções. Modelo não identificado (user agent reduzido).

Situação do aceite: meta de 50 ms **atingida no desktop** (com e sem pintura) e **não atingida neste celular** no cenário máximo. Decisão do usuário em 08/11/2026 ([ADR-0006](decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md)): orçamento mantido em 50 ms, aceite pelo desktop de referência e este celular registrado como limite conhecido, abaixo da classe de referência. A classe de celular de referência e a rodada estrutural para aparelhos de entrada ficam para a fase 5. **Fase 2 concluída.**

## Revisão e limites

Subagents econômicos gpt-6-luna trabalharam em áreas exclusivas (domínio, arquivos, painéis, landing, medição, revisão e documentação). Revisor independente retornou **ship** para código/capturas do editor, sem achados materiais nesse escopo; não reproduziu os fluxos. Uma inspeção adicional do PNG completo identificou nomes sobrepostos; o revisor pediu correção. Nomes foram divididos em duas linhas internas, com truncamento e largura limitada a 44 unidades; o navegador baixou full-corrected.png e o revisor marcou esse achado como resolvido. O nome completo permanece no JSON; a imagem individual preserva seu comportamento. O revisor também confirmou a integridade de $state.raw e dos mapas derivados, sem reavaliar desempenho. Motor/detector Impeccable indisponível por cache/permissões; fallback manual explicitado. Não é auditoria completa de acessibilidade, contraste ou segurança.

Próximo passo: fase 3. Definir a classe de celular de referência e otimizar para aparelhos de entrada fica para a fase 5 (ADR-0006). Na fase 3, implementar autenticação/persistência com autorização por proprietário, transações e conflitos entre dispositivos. PostgreSQL real e pacote Vercel completo continuam pendentes conforme a fase 1.
