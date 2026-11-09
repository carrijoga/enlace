# ADR-0012 — Planta da festa

Status: proposta em 09/11/2026. As escolhas marcadas como "decisão do usuário" estão confirmadas; o restante é proposta técnica e pode mudar na descoberta da fase 6. Nada deste documento está implementado.

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

## Questões abertas

- Lista de formatos prontos além de retângulo, quadrado e L.
- Medidas padrão de cada elemento e distância mínima usada no aviso de passagem.
- Mesa dos noivos como tipo próprio ou mesa comum com nome.
- Se categorias de convidados aparecem no desenho da mesa ou só na lista.
