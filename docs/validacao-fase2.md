# Validação do editor local — fase 2

Data: 07/11/2026, America/Sao_Paulo. Branch `codex/ceremony-editor`. Base fase 1 `91fab30`; domínio `60f3298`. Entrega funcional local, com pendências de desempenho/aparelhos reais. Sem push, deploy, conta, banco de negócio ou CSV.

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

Conclusão: no desktop de referência e no modo `layout`, todas as ações ficaram com p95 ≤ 50 ms na execução 2 e na série dedicada de formato; a execução 1 ficou acima apenas na troca de formato por dois picos. A meta de 50 ms está **atingida no desktop, sem incluir pintura**. Não foi repetida a medição `frame` (com pintura) depois das mudanças, porque o painel estava oculto; também não há medição em celular físico. Esses dois itens impedem declarar o aceite de desempenho completo.

Verificação visual após a mudança: desktop 1440×900 com a planta enquadrada (692×576 px dentro de 696×576, sem rolagem) e zoom 130%/150%/Ajustar corretos; mobile emulado 375×812 com zoom 100% mantendo o mínimo de 760 px e rolagem dentro do quadro, sem overflow da página. Testes: 44 em 7 arquivos; `check`, `lint` e `format:check` sem erros.

## Revisão e limites

Subagents econômicos gpt-6-luna trabalharam em áreas exclusivas (domínio, arquivos, painéis, landing, medição, revisão e documentação). Revisor independente retornou **ship** para código/capturas do editor, sem achados materiais nesse escopo; não reproduziu os fluxos. Uma inspeção adicional do PNG completo identificou nomes sobrepostos; o revisor pediu correção. Nomes foram divididos em duas linhas internas, com truncamento e largura limitada a 44 unidades; o navegador baixou full-corrected.png e o revisor marcou esse achado como resolvido. O nome completo permanece no JSON; a imagem individual preserva seu comportamento. O revisor também confirmou a integridade de $state.raw e dos mapas derivados, sem reavaliar desempenho. Motor/detector Impeccable indisponível por cache/permissões; fallback manual explicitado. Não é auditoria completa de acessibilidade, contraste ou segurança.

Próximo passo: repetir o benchmark no modo `frame` com o painel visível e medir num celular físico (Android/iOS de referência, registrando modelo); depois implementar autenticação/persistência com autorização por proprietário, transações e conflitos entre dispositivos. PostgreSQL real e pacote Vercel completo continuam pendentes conforme a fase 1.
