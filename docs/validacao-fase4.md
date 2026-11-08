# Validação da fase 4 — importações (escopo local)

Atualizado em 08/11/2026. Mesmo ambiente da [fase 3](validacao-fase3.md): Docker PostgreSQL 17, API `localhost:3011`, web dev `localhost:5183`. Dados e contas fictícios. Decisões em [ADR-0008](decisoes/0008-importacao-csv-de-convidados.md).

## Automatizado

- `csv.test.ts`: 39 testes (BOM, Windows-1252, três separadores e detecção, aspas com delimitador/quebra/`""`, CRLF/CR, linhas em branco e números de linha, aspas sem fechamento, limites, cabeçalho com acentos e alias ambíguo, categoria desconhecida e mapeada, categoria padrão, duplicidade, limites de nome/observação, `toGuests`, fórmula como texto, chaves de protótipo como `constructor`).
- Domínio: `addGuests` (lote numa alteração, planta e lugares intocados, limite de 300, IDs duplicados recusados).
- Total: 117 testes com `TEST_DATABASE_URL`; check, lint e formatação aprovados.
- Build de produção: JavaScript inicial do editor 83,73 KiB gzip (orçamento 150); CSV em chunk separado de 13,7 KB, ausente das rotas `/` e `/editor` iniciais.

## Navegador

1. Editor local, CSV com BOM, `;`, cabeçalho "Nome;Categoria;Observação", observação com `;` e quebra de linha entre aspas, categoria "Daminha", nome vazio, nome repetido com outra grafia, `=SOMA(A1)`: separador, cabeçalho e colunas detectados; linhas 2, 3, 4, 6, 7, 8 (quebra de linha preservando a numeração); erros e aviso de duplicidade corretos; botão bloqueado com explicação.
2. "Daminha" mapeada para Pajem, linhas com erro desmarcadas: 5 convidados adicionados (inclui o nome repetido), categorias e observações corretas, fórmula como texto. Um desfazer remove o lote; refazer devolve.
3. `/projetos`: JSON com versão desconhecida → "Arquivo inválido ou não reconhecido. Nenhum projeto foi criado."; lista inalterada. JSON exportado do editor → novo projeto revisão 1 na conta atual, editor aberto.
4. CSV no projeto da conta: revisão 1 → 2 numa única gravação, "Salvo na sua conta".
5. Defeito encontrado e corrigido: CSV sem cabeçalho com "convidada" na coluna de categoria era tratado como cabeçalho, pulando a primeira pessoa. Agora não é cabeçalho e a coluna de categoria é inferida.

## Limites

- Teclado, leitor de tela e celular do diálogo CSV não auditados (painel oculto; verificação por DOM). Desempenho da prévia com 1000 linhas não medido.
- PNG geral/individual não foram alterados nesta fase; continuam cobertos pelos testes de `pure-svg` e pela verificação da fase 2. Não há compartilhamento nativo: a saída é sempre download, o que atende a alternativa exigida.
- Importar JSON como novo projeto não é idempotente diante de queda de rede (nova tentativa cria outra identidade, sem acesso indevido).
