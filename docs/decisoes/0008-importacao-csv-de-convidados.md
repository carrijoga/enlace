# ADR-0008 — Importação CSV de convidados

Data: 08/11/2026. Status: aceita e implementada (fase 4).

## Contexto

O roadmap pede CSV com prévia, mapeamento de colunas, política de duplicidade e erros por linha, sem gravar nada antes da confirmação. O modelo de dados sugeria nome obrigatório, categoria e observação opcionais, separador selecionável e nenhuma deduplicação automática por nome.

## Decisão

- Parser próprio (RFC 4180, uma passagem), sem biblioteca: aspas, `""`, delimitador e quebras de linha dentro de aspas, CRLF/LF/CR. Módulo `apps/web/src/lib/editor/files/csv.ts` e diálogo `CsvImportDialog.svelte`, carregados sob demanda.
- Codificação: UTF-8 estrito com remoção de BOM; se inválido, Windows-1252 (padrão do Excel em pt-BR) com aviso visível para conferir acentos.
- Limites: 1 MiB, 1000 registros não vazios, 30 colunas. O limite de 300 convidados do projeto é aplicado na confirmação, mostrando quantos ainda cabem.
- Separador detectado na primeira linha (vírgula, ponto e vírgula, tabulação), alterável. Cabeçalho detectado por aliases sem acento/maiúscula; aliases que também são categorias ("convidado/a") não bastam sozinhos para marcar cabeçalho. Sem cabeçalho, nome = coluna 1 e uma coluna com apenas categorias conhecidas vira categoria.
- Categoria vazia usa a categoria padrão escolhida. Valores desconhecidos aparecem agrupados e exigem mapeamento explícito; até lá a linha fica com erro.
- Duplicidade por nome normalizado (com o projeto ou dentro do arquivo) é só aviso: nomes iguais são pessoas válidas. A pessoa pode desmarcar linhas individualmente ou todas as possíveis duplicadas.
- Linhas selecionadas com erro bloqueiam a confirmação; não há descarte silencioso. Cada linha importada recebe novo UUID, sem atribuir lugares nem alterar a planta.
- O lote entra como uma única alteração do editor (`addGuests` no domínio): um passo de desfazer e, em projetos da conta, uma revisão salva pelo fluxo existente (`expectedRevision` + `operationId`, repetição sem duplicar). Nenhuma rota nova na API.
- Conteúdo é texto: células como `=SOMA(A1)` são guardadas literalmente. Exportação CSV, que exigiria neutralizar fórmulas, não faz parte desta decisão.

Na página de projetos, "Importar JSON como novo projeto" valida com `parseProjectFile` e cria um projeto com novos ID de projeto e de operação; o proprietário vem da sessão no servidor. IDs internos do arquivo (fileiras, cadeiras, convidados) são mantidos e não colidem entre projetos (chaves compostas por projeto).

## Consequências

Sem dependência nova e sem custo no carregamento inicial do editor. Arquivos em outras codificações além de UTF-8/Windows-1252 podem exibir acentos errados; a prévia torna isso visível antes de gravar.
