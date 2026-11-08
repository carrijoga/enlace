# Validação da base executável

Data: 07/11/2026. Ambiente: Windows, Node 24.22.1, pnpm 12.18.0. Versões no lockfile; código ainda sem commits. Este relatório cobre a base, não o MVP completo.

## Evidências

- Instalação das dependências concluída, com lockfile e autorização de build apenas para `esbuild`.
- `check`: sem erros; Svelte Check retornou zero erros e zero avisos.
- `test`: 25 testes passaram em quatro arquivos, cobrindo API, configuração, transporte e contratos/migração JSON.
- `lint` e `format:check`: aprovados.
- `build`: contratos, API e frontend compilados em produção para preview local no Windows.
- HTTP local: frontend 200, `/health` da API 200 e `/api/health` pelo frontend 200 com o mesmo contrato.
- Navegador: exemplo de 55 lugares aberto, JSON baixado e conteúdo `format: enlace-project` confirmado; estado de conexão mostrou sucesso.
- Capturas reais em 1440 px e 390 px; no mobile, largura do conteúdo e viewport iguais a 390 px. Sem overflow horizontal observado. Emulação não comprova uso em aparelho físico.
- Revisor independente com modelo econômico retornou `ship`, sem achados materiais na revisão estática de capturas/código. Direção em `surfaces/bootstrap.md`, tokens em `../DESIGN.md`.

## Medição inicial

`pnpm run measure:web`: 37.679 bytes, **36,80 KiB gzip** de JavaScript inicial da rota `/`, somando cada chunk uma vez. Contém runtime/rota inicial; exclui o contrato Zod carregado após ação explícita e o fallback de erro não carregado inicialmente. Usa o HTML prerenderizado e imports estáticos do manifesto, não soma o servidor.

Meta inicial: 150 KiB gzip. A tela base está abaixo da meta. Não é benchmark de carregamento em rede real, INP, p95 da edição ou desempenho do editor completo; essas medições seguem na fase 2.

## Limites e pendências explícitas

- Pacote do adaptador Vercel não pôde ser concluído neste Windows por EPERM ao criar symlinks, inclusive fora do sandbox. `build:vercel` está exigido na CI Linux e na Vercel, ainda sem execução remota. O build local é separado e não é apresentado como pacote Vercel validado.
- Docker Desktop/daemon estava parado; Compose foi preparado, mas não houve banco real, migração ou teste de conexão PostgreSQL. Readiness saudável foi testada com dependência injetada; falhas devolvem 503 genérico.
- Arquivos Docker/VS Code adicionados paralelamente foram preservados. Os scripts de banco selecionam `docker-compose.yml` explicitamente; a influência do Dockerfile raiz na detecção de deploy precisa ser revisada antes de publicar.
- Sem contas, sessões, projetos persistidos, API de projeto, CSV ou PNG novos. O editor original permanece na referência privada e será migrado na fase 2.
- Capturas/teste visual foram feitos no servidor de desenvolvimento. A medição gzip usa artefatos compilados; não equivale a teste da versão hospedada.
- Motor/detector Impeccable não executou por cache/permissões indisponíveis. Revisão por capturas e código; não houve medição automática de contraste nem auditoria completa de teclado.
- CI, Railway e Vercel foram configurados em arquivos; nenhum push, publicação, conta ou recurso pago foi criado.

As capturas de QA ficam em `.impeccable/review/` (ignorado); não são dependência de build ou teste. O HTML original com dados pessoais permanece ignorado.
