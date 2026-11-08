---
name: Enlace
description: Papel acolhedor e verde de jardim para planejar cerimônias com clareza.
colors:
  forest: "#295842"
  paper: "#f6f5f0"
  surface: "#fffefb"
  ink: "#27342c"
  muted: "#626e63"
  line: "#dfe3da"
  field-line: "#7f8e7b"
  focus: "#6d936f"
  sidebar: "#f7f8f3"
  map-context: "#f3f6ee"
  warm-highlight: "#faf4e8"
  olive: "#72977d"
  gold: "#b89364"
  error: "#923d35"
typography:
  display:
    fontFamily: "Georgia, serif"
    fontSize: "clamp(38px, 4.2vw, 62px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.8
rounded:
  button: "9px"
  panel: "14px"
  editor-panel: "12px"
  control: "8px"
  compact: "6px"
spacing:
  actions: "10px"
  workspace: "clamp(32px, 6vw, 90px)"
  editor-columns: "270px / minmax(0, 1fr) / 292px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "13px 17px"
  button-primary-hover:
    backgroundColor: "#1e4433"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.button}"
    padding: "13px 17px"
  editor-button:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  editor-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  plan-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  editor-plan:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.editor-panel}"
---

# Design System: Enlace

## Overview

**Creative North Star: "Papel e jardim"**

O Enlace combina a calma do papel quente com verdes de jardim e uma ilustração própria da cerimônia. Georgia dá um tom afetivo aos títulos; Segoe UI mantém controles e dados fáceis de percorrer. A planta é desenhada em SVG nativo e continua sendo o foco visual do produto.

A landing em `/` apresenta a proposta e uma prévia esquemática; o editor em `/editor` transforma a mesma identidade numa ferramenta densa e prática. A interface usa superfícies claras, contornos leves e cor para indicar ações, orientação e estado. A geometria e as categorias da planta acrescentam o caráter visual sem uma biblioteca gráfica.

**Key Characteristics:**
- Papel quente, superfícies marfim e verde floresta.
- Georgia editorial combinada com sans-serif de sistema.
- Planta da cerimônia em SVG como assinatura visual.
- Controles compactos no editor e espaço de leitura na landing.

## Colors

A paleta mantém o verde como acento principal e usa neutros quentes; oliva, dourado, âmbar e vermelho aparecem em ilustração ou estados específicos.

### Primary
- **Verde floresta** (`{colors.forest}`): identidade, ações principais, seleções e navegação ativa.

### Neutral
- **Papel quente** (`{colors.paper}`): fundo geral.
- **Marfim** (`{colors.surface}`): painéis, planta e texto claro sobre ações verdes.
- **Tinta verde** (`{colors.ink}`): texto principal.
- **Verde suave** (`{colors.muted}`): metadados, instruções secundárias e rótulos.
- **Linha névoa** (`{colors.line}`): divisores e estrutura dos painéis.
- **Contorno de campo** (`{colors.field-line}`): borda de `input`, `select` e `textarea`, com contraste de 3:1 sobre papel e marfim (`--field-line`).
- **Verde de foco** (`{colors.focus}`): anel de foco visível.
- **Papel de apoio** (`{colors.sidebar}`): painéis laterais do editor.
- **Névoa de orientação** (`{colors.map-context}`): faixa com instrução contextual da planta.
- **Linho** (`{colors.warm-highlight}`): orientação do mapa individual.
- **Oliva** (`{colors.olive}`): marcador de estado e acentos da legenda.
- **Dourado de jardim** (`{colors.gold}`): detalhe do símbolo da marca e acentos da planta.
- **Vermelho de erro** (`{colors.error}`): falhas e mensagens de erro.

## Typography

**Display Font:** Georgia (com serif como fallback)
**Body Font:** Segoe UI (com system-ui e sans-serif como fallback)

**Character:** Georgia empresta intimidade e presença aos títulos. Segoe UI organiza controles e informação operacional com leitura familiar.

### Hierarchy
- **Display** (400, `clamp(38px, 4.2vw, 62px)`, line-height 1.12): chamada principal da landing; reduz em telas menores.
- **Headline** (400, 21–25px, Georgia): títulos de seção, diálogo e orientação.
- **Title** (600, 14–17px, Segoe UI): nomes de painéis e grupos de controles.
- **Body** (400, 13–16px, line-height até 1.8): explicação e conteúdo de formulário.
- **Label** (400–600, 9–13px, Segoe UI): rótulos, estados e estatísticas do editor; use algarismos tabulares para contagens.

## Layout

A landing usa conteúdo centralizado até 1440px, padding horizontal fluido de 24–80px e uma composição de duas colunas para apresentação e prévia. Até 680px, vira coluna única, com introdução antes da planta; abaixo de 900px, o espaço entre colunas diminui. A largura mínima geral é 320px.

O editor em desktop usa três colunas: estrutura de 270px, planta flexível e convidados de 292px. Até 1200px, as laterais passam a 240px e 260px. Em 980px ou menos, o mapa deixa de ficar preso ao centro e aparece primeiro, seguido por abas para estrutura e pessoas. Até 540px, ferramentas do cabeçalho quebram em uma linha própria. Os painéis laterais podem rolar independentemente em desktop; em telas menores, fazem parte do fluxo vertical.

## Elevation & Depth

O sistema é plano e não usa sombras CSS nas superfícies usuais. Bordas finas, fundos tonais próximos e espaço entre áreas definem a hierarquia. O mapa recebe uma superfície clara contornada; a faixa contextual e os estados coloridos distinguem orientação e seleção.

## Shapes

Controles têm cantos moderadamente arredondados (6–9px); painéis da planta usam raio maior (12–14px). Campos e painéis laterais usam contornos discretos. A planta conserva sua geometria SVG própria; assentos aparecem como formas pequenas de cantos suaves, com preenchimento e contorno por categoria.

## Components

### Buttons
- **Caráter:** ações compactas, claras e táteis; na landing, o botão primário tem mais espaço e um ícone de seta.
- **Primário:** fundo floresta e texto marfim; landing usa padding de 13px 17px e raio 9px. O editor usa 9px 13px e raio 8px.
- **Secundário:** fundo transparente, contorno verde suave e texto floresta; hover recebe fundo verde muito claro.
- **Hover / Focus:** hover clareia ou escurece o fundo conforme a variante; foco global é outline sólido de 3px com afastamento de 5px.
- **Desabilitado:** opacidade 0.6 e cursor de espera.

### Inputs / Fields
- Campos do editor usam fundo claro, borda neutra e cantos moderados; seletores e caixas de texto mantêm aparência nativa e controles familiares.
- Contorno em `{colors.field-line}`. Foco usa o anel verde global. Campos de busca e de cadastro são organizados com rótulos explícitos.

### Cards / Containers
- **Painel da planta na landing:** superfície marfim, borda de 1px, raio 14px, cabeçalho e legenda separados do desenho.
- **Área da planta no editor:** superfície marfim contornada, raio 12px e conteúdo recortado; estatísticas e toolbar ficam no topo, contexto e legenda abaixo do mapa.
- **Laterais do editor:** superfície de papel de apoio, divisores entre conteúdo e rolagem própria em telas largas.

### Navigation
- Cabeçalho da landing tem marca à esquerda e link de entrada ao editor à direita.
- Cabeçalho do editor reúne marca, projeto e estado local, histórico e ações de arquivo. Em telas estreitas, ferramentas ocupam uma linha separada.
- Em até 980px, abas “Estrutura” e “Pessoas” selecionam o painel exibido abaixo da planta; o estado ativo usa texto e borda inferior verde.

### Signature Component
- **Planta da cerimônia:** SVG nativo com altar, corredor, fileiras, assentos, orientação e legenda. No editor, zoom e enquadramento ficam junto ao título; seleção e ocupação aparecem diretamente nos lugares. As categorias usam acentos de cor próprios e a instrução contextual explica a próxima ação. "Ver lugares em lista", no painel de convidados, oferece a mesma planta em texto, com seleção e atribuição, para leitor de tela e para quem não alcança as cadeiras pequenas no celular.

## Do's and Don'ts

### Do:
- **Do** manter o papel quente e o verde floresta como base reconhecível.
- **Do** preservar Georgia nos títulos e Segoe UI nos controles e dados.
- **Do** manter o anel de foco de 3px com afastamento de 5px.
- **Do** preservar a planta SVG nativa como foco e assinatura visual.
- **Do** adaptar a composição do editor nos limites de 1200px, 980px e 540px observados.
- **Do** respeitar movimento reduzido, removendo transições.

### Don't:
- **Don't** introduzir sombras nas superfícies comuns; a hierarquia existente usa bordas e tonalidades.
- **Don't** substituir a geometria de assentos por uma biblioteca gráfica ou um visual genérico.
- **Don't** usar as cores de categoria como substitutas do verde principal para ações globais.
