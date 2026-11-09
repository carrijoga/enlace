# ADR-0010 — Cartão de exportação da planta

Status: aceita em 08/11/2026.

## Contexto

O PNG do editor novo perdeu a composição do protótipo v3: sem título, moldura, arco, corredor tracejado, resumo ou assinatura, com data em ISO e nomes deformados por `textLength`. O usuário comparou os dois arquivos e pediu a melhora da exportação.

## Decisão

`createMapSvg` (`apps/web/src/lib/editor/files/pure-svg.ts`) volta a gerar o cartão do v3 em SVG puro, a partir do projeto validado, sem clonar o DOM do editor nem herdar seleção ou estado transitório.

- Página de 1600 de largura e altura calculada pela planta, com enquadramento do conteúdo e escala limitada. PNG em até 3200 px de largura e 10 milhões de pixels.
- Título: `project.title`; títulos automáticos ("Minha cerimônia", "Meu projeto", "Cerimônia de exemplo") usam "Nosso lugar no sim".
- Fontes do `DESIGN.md`: Georgia na planta e nos títulos, Segoe UI nas informações.

Correções sobre o v3, sem mudar a geometria:

- ESQUERDA/DIREITA ficam acima da primeira fileira de cada lado, em vez de cobertos pelas cadeiras em meia-lua.
- CORREDOR e a largura ocupam duas linhas para caber em corredores estreitos.
- A assinatura tem espaço próprio e não encosta na moldura.
- Texto reduz até caber e só então recebe reticências; as letras nunca são esticadas.
- Pessoas com o mesmo primeiro nome ganham a inicial do sobrenome.

## Limite de privacidade do mapa individual

Por decisão do usuário em 08/11/2026, o mapa individual mostra o casal e a data, como no v3, o que amplia a ADR-0004. Dos convidados, continua trazendo só o destinatário e sua cadeira; a geometria dos demais lugares é neutra, sem nomes, categorias ou ocupação.

## Consequências

A largura do texto é estimada por tabela calibrada na Georgia em negrito, sem medir no DOM, para manter a função pura e testável. Sem Georgia ou Segoe UI no aparelho, a imagem usa as fontes `serif`/`sans-serif` do sistema e as medidas podem variar um pouco. A impressão (`window.print`) continua usando a planta do editor e não foi alterada.
