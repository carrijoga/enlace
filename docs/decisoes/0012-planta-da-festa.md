# ADR-0012 — Planta da festa

Status: em implementação desde 09/11/2026. As escolhas marcadas como "decisão do usuário" estão confirmadas; o restante é proposta técnica e pode mudar durante a fase 6. Implementados: contrato v2, domínio da festa (em subpath próprio), persistência e o editor da festa (etapa 4, local). Faltam as saídas da festa (PNG, impressão, lista por mesa) e as medições da etapa 5. Ver "Andamento" no fim do documento.

## Contexto

O Enlace planeja só a cerimônia. O usuário quer planejar também a festa, em salão fechado: onde ficam as mesas, o DJ, a mesa de bolo e doces e as demais atrações, e quem senta em cada mesa.

A cerimônia é gerada por parâmetros (formato, corredor, fileiras). A festa é composição livre: cada elemento é colocado à mão num espaço com medidas. Até aqui, posicionamento livre e medidas reais estavam fora do escopo, aguardando descoberta (`PRODUCT.md`, roadmap).

## Decisões do usuário (09/11/2026)

1. **Medidas reais.** A pessoa informa as medidas do salão e dos elementos.
2. **Convidados por mesa.** Cada mesa tem N cadeiras, definido pela pessoa. A atribuição é à mesa, não a uma cadeira específica.
3. **Formato do salão.** A pessoa escolhe um formato pronto ou cria o seu manualmente com as medidas reais.
4. **Fase 6.** A festa entra no roadmap como nova fase.

## Proposta

### Produto

- Dentro do mesmo projeto, o editor ganha duas plantas: Cerimônia e Festa. A lista de convidados é única.
- Cada convidado tem um lugar na cerimônia e, independentemente, uma mesa na festa.
- **Salão:** formatos prontos (retangular, quadrado, em L) preenchidos com medidas, ou salão manual, descrito parede a parede com ângulos retos. Portas ficam nas paredes; colunas são obstáculos dentro do salão.
- **Mesas:** redondas ou retangulares, com nome ou número, dimensões e quantidade de cadeiras.
- **Elementos:** pista de dança, DJ/som, mesa de bolo, mesa de doces, bar, buffet, área de fotos e item personalizado com nome próprio. Cada um tem medidas padrão editáveis.
- **Edição:** arrastar, girar, encaixar em grade de 10 cm, duplicar e remover, com desfazer e salvamento iguais aos da cerimônia.
- **Avisos, não bloqueios:** elemento fora do salão, sobreposição, passagem estreita e mesa acima da capacidade aparecem como aviso. O espaçamento é indicativo e não substitui o projeto do local nem as normas de segurança, o que a interface precisa dizer.
- **Saídas:** PNG e impressão do salão e lista de convidados por mesa. Mapa individual "sua mesa" fica fora da primeira entrega.

### Dados

- JSON do projeto passa a `schemaVersion: 2`, com `reception` opcional: `room`, `tables`, `items` e `tableAssignments`. Arquivos v1 e rascunhos locais migram com `reception: null`; o v3 legado continua migrando.
- Medidas em centímetros inteiros no armazenamento e metros na interface, aceitando vírgula decimal. Evita erro de arredondamento.
- O salão é um polígono ortogonal fechado. Formatos prontos são geradores desse mesmo polígono, sem caso especial no domínio.
- Posição das cadeiras é derivada de forma, dimensões e quantidade; só a quantidade é persistida.
- Uma mesa não recebe convidado duas vezes e cada convidado tem no máximo uma mesa. Apagar mesa ou reduzir cadeiras abaixo da ocupação pede confirmação e deixa os excedentes sem mesa; ninguém some da lista, igual à cerimônia.
- Limites iniciais a validar: salão até 100 × 100 m, 100 mesas, 1 a 24 cadeiras por mesa, 60 elementos.

### Persistência

Segue o padrão atual: salão, mesas e elementos em JSONB versionado, atribuições às mesas em tabela relacional com unicidade por projeto e convidado. Tudo muda na mesma transação e revisão de cerimônia e convidados, com `expectedRevision`, `operationId` e escopo por proprietário. A importação valida formato, limites, IDs e referências como no restante do JSON.

### Domínio e interface

- Geometria, invariantes e avisos em funções puras de `packages/domain`, sem dependência de interface ou banco.
- SVG nativo, sem biblioteca de canvas. Durante o arraste só o `transform` do elemento muda, e o projeto é atualizado ao soltar.
- A planta da festa carrega sob demanda; o JavaScript inicial da cerimônia não cresce por causa dela.
- Toque e teclado têm caminho completo sem arraste: painel com posição, medidas e rotação, setas movendo 10 cm e uma lista "Ver salão em lista" equivalente à lista de lugares.

## Consequências

- Muda o contrato, o schema e a migração; é a maior alteração de dados desde a fase 3. `layout_schema_version` e os testes de round-trip precisam acompanhar.
- Revoga, só para a festa, o limite de "sem medidas reais": a cerimônia continua esquemática.
- O arraste no celular é o maior risco. Deve ser validado no Moto G84 antes de construir o resto da interface.
- Com medidas reais, as pessoas confiam na escala; os avisos e o texto sobre precisão fazem parte da entrega.
- A ordem recomendada é iniciar depois do aceite hospedado da fase 5, para não misturar uma mudança grande de dados com uma versão ainda não validada em ambiente real.

## Andamento (09/11/2026)

O usuário pediu o início da fase 6 antes do aceite hospedado da fase 5, que era apenas recomendação.

Decisões técnicas tomadas ao implementar:

- **Corte em duas etapas.** Na etapa 2, `reception` viveu em subpaths próprios e `parseProjectFile`, rascunhos e API seguiram em v1, recusando o campo: a API grava só colunas conhecidas, e aceitar o campo antes faria o servidor responder sucesso e perder a festa. O corte para v2 aconteceu junto da migração do banco, na etapa 3 (abaixo).
- **Subpath em vez de tree-shaking.** Schemas Zod são chamadas no topo do módulo e podem permanecer no pacote; o subpath garante por construção que o código da festa não entra no JavaScript inicial. Na etapa 3 só o contrato saiu do subpath; o domínio da festa continua nele.
- **Capacidade é aviso.** Atribuir acima das cadeiras é permitido e gera `table_over_capacity`, como pedem os avisos da proposta. Reduzir cadeiras retira os excedentes, na ordem inversa de atribuição, depois da confirmação feita pela interface.
- **Faixa de cadeiras nos avisos.** Mesas ocupam 45 cm além do tampo para calcular passagem; mesa retangular só nos lados maiores, onde ficam as cadeiras. Sobreposição usa só o tampo.
- **Quem não forma passagem.** Pista e área de fotos são caminháveis: acusam sobreposição, não passagem estreita. Itens encostados (até 10 cm) em parede ou outro item também não geram aviso, para mesa de bolo junto da de doces, por exemplo.
- **Colunas** são retângulos sem rotação, limitadas a 40; **portas** a 20. Trocar o contorno remove as portas que não cabem, e `getRoomChangeImpact` permite confirmar antes.

Etapa 3, persistência e corte para v2 (09/11/2026):

- **v2 é o formato atual.** `projectSchema`/`Project` (cerimônia estrita mais `reception` obrigatório e anulável) ficam na entrada principal de `@enlace/contracts`; o subpath `@enlace/contracts/reception` foi removido. `parseProjectFile` devolve v2 e migra v1 e v3 com `reception: null`. Transporte da API usa o projeto completo.
- **O contrato entra no JavaScript inicial; a festa não.** Validar rascunho, resposta da API e salvamento exige o schema já na abertura. Custo medido: cerca de 1,8 KiB gzip (módulo isolado, minificado); `/editor` ficou em ~88 KiB gzip no build de produção, contra 150 KiB de orçamento. Geometria, avisos e comandos da festa continuam em `@enlace/domain/reception` e não aparecem em nenhum chunk da web.
- **Projeto sem `reception` é recusado (400), não tratado como nulo.** Um cliente anterior ao v2 que salvasse sem o campo apagaria a festa em silêncio. Só os rascunhos de conta já salvos no navegador antes do corte aceitam a ausência como `null`: naquela revisão o servidor ainda não tinha festa.
- **Banco:** `projects.reception` (JSONB com salão, mesas e elementos) e `projects.reception_schema_version`, com `CHECK` que exige os dois nulos ou os dois preenchidos (versão 1, objeto). `table_assignments` tem chave `(project_id, guest_id)`, FK composta para `guests` com cascata e `sort_order`, porque reduzir cadeiras retira os últimos atribuídos. A mesa vive no JSONB, então sua existência é validada pelo contrato antes do commit, como já ocorre com cadeiras. Tudo grava na mesma transação, revisão e recibo da cerimônia.
- **Remover convidado** (`removeGuest` do domínio da cerimônia) também retira a mesa dele; sem isso o próximo salvamento seria recusado por referência inválida.
- **Publicação conjunta.** API (com a migração no pré-deploy) e web precisam ir ao ar juntas: a web antiga recusa projetos com `reception` vindos da API nova, e a API antiga recusa salvamentos com `reception` da web nova. Não há perda de dados nessa janela, só erro visível. Recibo de idempotência gravado antes do corte não reconhece a repetição da mesma operação depois dele (`operation_reused`); o cliente recarrega o projeto.

Etapa 4, editor (10/11/2026):

- **Medição no Moto G84 adiada (decisão do usuário).** A etapa 4 começou sem o ensaio de arraste no aparelho. O risco continua: se o p95 passar de 50 ms no Moto G84, a interface de arraste terá de mudar. A medição segue obrigatória no aceite da fase 6.
- **Alternância no cabeçalho.** "Cerimônia | Festa" troca a área de trabalho inteira; cabeçalho, desfazer, salvamento, rascunhos e confirmações são os mesmos. A escolha fica em `sessionStorage` (`enlace:editor-view:v1`), não na URL: as APIs de histórico conflitam com o roteador do SvelteKit e a regra de lint de navegação não aceita manter `?project=`.
- **Carregamento sob demanda.** `ReceptionEditor.svelte` e os componentes em `apps/web/src/lib/editor/reception/` entram por `import()` ao abrir a festa: chunk próprio de ~19,6 KiB gzip. O JavaScript inicial de `/editor` passou de 89.962 para 90.758 bytes gzip (só o botão e o carregador).
- **Atribuição sem arrastar convidado.** Escolher a pessoa e tocar na mesa (na planta ou na lista), ou o seletor "Sentar em…" de cada convidado. Arrastar convidado até a mesa não foi feito; arrastar serve para mover elementos.
- **Teclado.** A planta tem uma parada de Tab (elemento selecionado ou o primeiro); setas movem 10 cm e Shift+setas 50 cm, cada passo uma alteração com desfazer. Para chegar a outro elemento sem mouse, usar "Ver salão em lista" ou os avisos, que selecionam o elemento.
- **Elementos novos** entram no centro do salão, encaixados na grade. Mesa retangular nova: 1,8 × 0,9 m, 6 cadeiras. Coluna nova: 40 × 40 cm.
- **Medidas digitadas não são encaixadas na grade**; só o arraste e as setas encaixam. O contrato aceita qualquer centímetro inteiro.
- **Confirmações**, pela mesma janela da cerimônia, citando até quatro nomes: reduzir cadeiras abaixo da ocupação, remover mesa com convidados e trocar o contorno quando portas deixam de caber.

Ajustes do editor pedidos pelo usuário (10/11/2026):

- **Seleção estável quando surgem avisos.** A lista de avisos ficava abaixo da planta e crescia a cada aviso novo; a planta encolhia, mudava de escala e o elemento saía de baixo do ponteiro, parecendo perder a seleção. Os avisos passaram a um menu suspenso ("N avisos") no cabeçalho da planta, sobreposto a ela, e a faixa de instruções tem altura fixa: nenhum aviso muda o tamanho da planta. Durante um arraste o tamanho do SVG fica congelado, e o clique que o navegador dispara depois de soltar um elemento não desmarca a seleção, mesmo que caia no piso.
- **Portas com abertura.** Campo `opening` na porta: `inward` (para dentro), `outward` (para fora) ou `sliding` (de correr). Arquivos, rascunhos e projetos salvos antes da opção não têm o campo e valem como `inward` (padrão do schema), sem migração de banco nem nova versão de formato. Uma web anterior a esta mudança recusa portas com `opening` (schema estrito); publicar API e web juntas, como nas etapas anteriores.
- **Portas arrastáveis.** Porta é selecionável na planta e no painel "Portas"; o arraste a leva ao longo do contorno e pode passar para outra parede. `placeDoorNear` (domínio) escolhe a parede mais próxima em que a porta cabe, encaixa a posição na grade de 10 cm e mantém a porta inteira dentro da parede. Setas movem 10 cm (Shift: 50 cm) ao longo da parede. Cada soltura é um passo de desfazer, como nos demais elementos. A geometria do desenho (`getDoorGeometry`, com a normal para dentro do salão) também fica no domínio.
- **Fora de escopo por ora:** lado da dobradiça (a folha sempre gira a partir do início da parede) e portas de duas folhas.

Valores provisórios das questões abertas, a revisar quando a interface existir: passagem mínima indicativa de 90 cm e medidas padrão em `RECEPTION_ITEM_DEFAULTS`.

## Questões abertas

- Lista de formatos prontos além de retângulo, quadrado e L.
- Confirmação das medidas padrão de cada elemento e da passagem mínima (valores provisórios acima).
- Mesa dos noivos como tipo próprio ou mesa comum com nome.
- Se categorias de convidados aparecem no desenho da mesa ou só na lista.
