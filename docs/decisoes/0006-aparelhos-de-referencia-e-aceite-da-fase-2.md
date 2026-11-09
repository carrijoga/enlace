# ADR-0006 — Aparelhos de referência e aceite de desempenho da fase 2

Status: aceito. Data: 08/11/2026. Decisão do usuário após o ensaio em celular físico.

## Contexto

`docs/desempenho.md` fixa p95 ≤ 50 ms para as ações locais “no aparelho de referência”, sem que um aparelho tivesse sido definido, e proíbe ampliar o orçamento sem registro. No cenário máximo (288 cadeiras, 300 convidados):

- Desktop de referência (Windows, navegador integrado, build de produção): todas as ações com p95 ≤ 50 ms, sem pintura e com pintura (pior p95 37,1 ms no modo `frame`).
- Celular Android do usuário (Chrome 156, user agent reduzido “Android 10; K”, modelo não informado, tela 509×1130 CSS px @2,125x): quase todas as ações entre ~50 e ~70 ms de p95, com variação grande entre execuções. Uma comparação A/B no mesmo aparelho confirmou que a correção de filtro/busca melhora o pior caso, mas não leva o aparelho à meta. O celular é ~3–4× mais lento que o desktop.

Atingir a meta nesse aparelho exigiria uma rodada estrutural: atualizar só as cadeiras e linhas afetadas por troca e seleção, virtualizar a lista de convidados e possivelmente reduzir as legendas desenhadas na planta. O custo restante da troca de formato vem do layout e da pintura das 576 legendas SVG.

## Decisão

- O orçamento de **p95 ≤ 50 ms continua o mesmo**; não é ampliado.
- O aceite de desempenho da fase 2 é dado pelo **desktop de referência**, onde a meta foi atingida com e sem pintura.
- O celular testado é registrado como **limite conhecido**: aparelho de entrada/antigo, abaixo da classe de referência, com os números da [validação da fase 2](../validacao-fase2.md). Não se promete p95 ≤ 50 ms nele no cenário máximo.
- A classe de celular de referência (modelo identificado, faixa de desempenho e navegador) será definida na fase 5, antes de declarar as metas de desempenho aferidas para a primeira versão utilizável.
- A otimização para celulares de entrada vai para a fase 5, a ser priorizada conforme a referência escolhida: atualização fina por cadeira/linha em troca e seleção, lista virtualizada se a medição justificar, e revisão das legendas da planta.

## Consequências

A fase 2 é declarada concluída e a fase 3 (contas e persistência) pode começar. Os ensaios ficam reproduzíveis: `scripts/bench-editor.js` (desktop) e `scripts/bench-phone.html` (celular na rede local). No endereço `http://<IP>` da rede local, `crypto.randomUUID` não existe e adicionar convidado ou fileira falha; em produção (https) e em `localhost`, não. A correção de filtro/busca e a lista estável de cadeiras da planta permanecem no código. Mudanças no editor que afetem estas ações devem repetir as medições no desktop de referência e, quando houver, no celular de referência.
