# ADR-0011 — Movimento da interface

Status: aceita e implementada em 08/11/2026.

## Contexto

O usuário considerou o frontend sem vida e pediu animações e pequenos detalhes. A interface só tinha a transição de fundo dos botões da landing. O editor precisa manter p95 ≤ 50 ms no cenário de 288 cadeiras e 300 convidados, e o produto é tão usado no celular quanto no computador.

## Decisão

Movimento nativo (CSS, Web Animations API, `svelte/animate`, View Transitions), sem biblioteca nova. Tokens e regras em `DESIGN.md` (seção Motion).

- **Landing:** um único momento autoral. O altar e o corredor se traçam, as cadeiras se assentam fileira a fileira e as primeiras pessoas chegam. O estado final está no SVG; sem CSS ou com movimento reduzido, a planta aparece pronta. A prévia passa a mostrar 10 lugares ocupados, ilustrativos.
- **Planta:** as cadeiras deslizam entre as poses ao mudar formato, corredor ou fileiras (`plan-motion.ts`), e a cadeira recebe a pessoa com um aro dourado. A curvatura não anima, porque o controle dispara a cada passo.
- **Interface:** resposta de toque, menu, diálogos, estado de salvamento, contadores, mensagens, aba móvel e o fio dourado que mostra a ocupação da planta.

Regras que sustentam o orçamento:

- O deslizamento é aditivo (`composite: 'add'`) sobre o atributo `transform`: a planta continua sendo renderizada pela posição final, e uma troca no meio do caminho soma-se à anterior sem salto.
- O deslizamento só dispara quando `project.layout` muda. Edições de convidados e lugares não percorrem as cadeiras.
- Acima de `SEAT_MOTION_LIMIT` (120 cadeiras) nada anima dentro do SVG e as animações disparadas a cada seleção ficam desligadas (`.dense`, `.dense-plan`). Diálogos e menu continuam animados.
- Linhas da lista de convidados não têm `@keyframes`: alternar `hidden` reiniciaria até 300 animações.
- Com movimento reduzido nada se desloca nem repete; cor e opacidade seguem confirmando o estado.

## Por que o limite existe

Qualquer animação dentro do SVG repinta todas as cadeiras e legendas a cada quadro, na thread principal. Medido em 08/11, build de produção, desktop local, mesma origem em portas distintas, 288 cadeiras, 20 amostras por ação, modo frame, p95 em ms:

| Build | Selecionar cadeira | Trocar ocupantes |
| --- | --- | --- |
| Sem o movimento (`HEAD`) | 15,6 – 18,2 | 43,7 – 50,4 |
| Movimento sem limite nas animações de seleção | 21,3 – 25,2 | 51,3 – 54,3 |
| Final, com limite | 14,7 – 19,5 | 46,7 – 50,1 |

Uma quarta rodada do build final (50,9 e 73) coincidiu com o redimensionamento do painel do navegador e foi descartada. Com 120 cadeiras, no mesmo desktop de 144 Hz, o intervalo entre quadros durante o deslizamento ficou com p95 de 14,3 a 21,3 ms, e 34,2 ms na primeira execução.

JavaScript inicial gzip, mesmo método nos dois builds: landing 40.209 → 42.388 bytes; editor 86.859 → 89.448 bytes, abaixo de 150 KiB.

## Consequências e limites

- Planos com mais de 120 cadeiras ficam mais estáticos dentro da planta, por escolha.
- O limite de 120 foi medido só no desktop. Falta medir o deslizamento no Moto G84; se travar, baixar a constante.
- `prefers-reduced-motion` foi implementado, mas não exercitado com a preferência real do sistema.
- View Transitions é aprimoramento progressivo; sem suporte, a troca de tela é direta.
- O movimento fica fora do PNG e da impressão.
