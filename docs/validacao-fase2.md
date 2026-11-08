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

Pendências: perfil detalhado do cenário máximo, mover/trocar/selecionar/filtrar sob carga, métricas de exportação repetida/memória e cache vazio em hospedagem. Não prometer rapidez em todo aparelho com base neste ensaio. Edição funciona no estado local e não chama API de projeto; não houve simulação de rede offline nesta rodada.

## Revisão e limites

Subagents econômicos gpt-6-luna trabalharam em áreas exclusivas (domínio, arquivos, painéis, landing, medição, revisão e documentação). Revisor independente retornou **ship** para código/capturas do editor, sem achados materiais nesse escopo; não reproduziu os fluxos. Uma inspeção adicional do PNG completo identificou nomes sobrepostos; o revisor pediu correção. Nomes foram divididos em duas linhas internas, com truncamento e largura limitada a 44 unidades; o navegador baixou full-corrected.png e o revisor marcou esse achado como resolvido. O nome completo permanece no JSON; a imagem individual preserva seu comportamento. O revisor também confirmou a integridade de $state.raw e dos mapas derivados, sem reavaliar desempenho. Motor/detector Impeccable indisponível por cache/permissões; fallback manual explicitado. Não é auditoria completa de acessibilidade, contraste ou segurança.

Próximo passo: fechar o desvio de desempenho e a cobertura de uso em aparelho real; depois implementar autenticação/persistência com autorização por proprietário, transações e conflitos entre dispositivos. PostgreSQL real e pacote Vercel completo continuam pendentes conforme a fase 1.
