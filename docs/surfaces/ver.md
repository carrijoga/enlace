# Visualização compartilhada da cerimônia

Rota `/ver`. Modo **Operate**. Quem recebe o link consulta a disposição da cerimônia e, quando o link inclui nomes, encontra a própria cadeira. O [ADR-0014](../decisoes/0014-link-de-visualizacao.md) descreve as permissões e os dados de cada modo.

## Distribuição

- A partir de 62 rem, a coluna à esquerda reúne os dados da cerimônia, a busca por nome e a lista de lugares. A planta usa a coluna flexível e aproveita a altura da janela. Zoom, cadeira selecionada, legenda e orientação ficam junto do desenho.
- Em telas mais estreitas, os mesmos elementos seguem em uma coluna e conservam a ordem de navegação por teclado. A lista abre sob demanda e o desenho inicia enquadrado. Ao aumentar o zoom, a área da planta tem rolagem própria.
- Os resultados da busca mantêm uma altura limitada. Ao escolher um nome, o foco vai para o título da planta e a cadeira recebe destaque. No modo “Só a planta”, a lista e o desenho indicam a ocupação sem expor nomes de convidados.

## Validação local em 21/11/2026

No navegador Orca, uma cerimônia fictícia com 55 cadeiras mostrou planta e legenda na primeira tela em 1440 × 900 e 390 × 844. Em 320 × 568, uma planta com 288 cadeiras abriu sem rolagem horizontal da página. A busca mostrou até oito resultados com nomes longos e levou à cadeira escolhida na última fileira. A validação também cobriu a mudança de uma para duas colunas entre 991 e 992 px, busca por teclado, zoom até 200% e retorno ao enquadramento, modo anônimo, link incompleto ou indisponível e nova tentativa após erro temporário.

O build de preview no Windows mediu cerca de 79,2 KiB gzip de JavaScript inicial em `/ver`. As verificações com leitor de tela, Moto G84 físico e hospedagem estão no [fechamento da fase 7](../roadmap.md#fase-7--link-de-visualização--etapas-1-a-3-integradas-à-main-fechamento-pendente-executa-antes-da-fase-6).
