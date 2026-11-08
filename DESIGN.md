---
name: Enlace
description: Identidade visual herdada do protótipo na tela bootstrap.
colors:
  forest: "#295842"
  paper: "#f6f5f0"
  surface: "#fffefb"
  ink: "#27342c"
  muted: "#626e63"
  line: "#dfe3da"
  focus: "#6d936f"
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
spacing:
  actions: "10px"
  workspace: "clamp(32px, 6vw, 90px)"
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
  plan-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Design System: Enlace

## Overview

**Creative North Star: "Papel e jardim"**

O bootstrap preserva a identidade do protótipo: papel claro, verde profundo, títulos serifados e uma planta ilustrada como foco visual. A composição é arejada e editorial, com controles discretos que deixam o exemplo da cerimônia em evidência.

Este registro cobre somente a tela bootstrap atual. Não descreve o editor final nem funcionalidades planejadas.

**Key Characteristics:**
- Papel quente e superfícies quase brancas.
- Contraste entre Georgia nos títulos e Segoe UI na interface.
- Planta SVG como visual principal.

## Colors

A paleta usa verdes naturais sobre neutros quentes; cores de erro e detalhes da ilustração aparecem apenas em contextos específicos.

### Primary
- **Verde floresta** (`{colors.forest}`): ações principais, links e elementos da marca.

### Neutral
- **Papel** (`{colors.paper}`): fundo geral.
- **Superfície marfim** (`{colors.surface}`): painel da planta e texto claro no botão primário.
- **Tinta verde** (`{colors.ink}`): texto principal.
- **Verde suave** (`{colors.muted}`): texto secundário.
- **Linha névoa** (`{colors.line}`): bordas e divisores.
- **Verde foco** (`{colors.focus}`): contorno de foco visível.

## Typography

**Display Font:** Georgia (serif)
**Body Font:** Segoe UI (com system-ui e sans-serif como fallback)

**Character:** A serifada dá caráter acolhedor aos títulos; a sans-serif mantém controles e informações compactos e familiares.

### Hierarchy
- **Display** (400, clamp 38–62px, line-height 1.12): título principal.
- **Headline** (400, 21px, Georgia): títulos das seções de apoio.
- **Title** (600, 15–17px, Segoe UI): títulos de painel e resumo.
- **Body** (400, 16px, line-height 1.8): texto introdutório; reduz para 14px no celular.
- **Label** (400, 10–13px, Segoe UI): orientação da planta, metadados e notas.

## Layout

O conteúdo fica centralizado até 1440px, com recuo lateral fluido de 24 a 80px. Acima de 680px, a área principal usa duas colunas (0.9fr/1.1fr); até 680px vira coluna única, mantendo introdução antes da planta. Abaixo de 900px, o intervalo entre colunas diminui. Em telas estreitas, ações podem quebrar linha e seções de apoio empilham. A página aceita largura mínima de 320px.

## Elevation & Depth

O sistema é plano: não há sombras CSS. A hierarquia vem de fundos próximos, bordas finas e separação por espaço. O painel da planta tem fundo de superfície, contorno e recorte de conteúdo.

## Shapes

Controles têm cantos moderadamente arredondados (9px); o painel principal usa raio maior (14px). Bordas claras e finas definem superfícies; o SVG da planta permanece sem moldura própria.

## Components

### Buttons
- **Primário:** fundo verde floresta, texto marfim, raio 9px, padding desktop 13px 17px; hover escurece o fundo.
- **Secundário:** fundo transparente, borda verde acinzentada e texto verde; hover recebe fundo verde muito claro.
- **Foco:** outline de 3px verde, afastado 5px, aplicado via `:focus-visible`.
- **Celular:** altura mínima 44px e padding 12px 14px.
- **Desabilitado:** opacidade 0.6 e cursor de espera.

### Cards / Containers
- **Painel da planta:** superfície marfim, borda de 1px, raio 14px e conteúdo recortado; cabeçalho, desenho e legenda separados por espaço e divisores.

### Navigation
- **Cabeçalho:** marca à esquerda e descrição curta à direita, com divisor inferior; em telas estreitas reduz alturas, marca e descrição.

### Signature Component
- **Planta:** SVG responsivo centralizado no painel; rótulos usam Segoe UI, lugares ocupados e livres são distinguidos visualmente.

## Do's and Don'ts

### Do:
- **Do** manter o fundo papel e o verde como acento principal.
- **Do** preservar o foco visível de 3px com afastamento de 5px.
- **Do** empilhar a introdução e a planta em telas de até 680px.
- **Do** respeitar movimento reduzido, removendo transições.

### Don't:
- **Don't** introduzir sombras: a interface atual usa bordas e tonalidade para separar superfícies.
- **Don't** tratar o bootstrap como especificação visual do editor final.
