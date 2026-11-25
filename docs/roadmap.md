# Roadmap de implementação

Atualizado em 20/11/2026, com frontend Vercel e backend/PostgreSQL Railway. Fases 0 e 1 concluídas no escopo local. Fase 2 concluída em 08/11/2026: meta de desempenho atingida no desktop de referência; o celular de entrada testado ficou registrado como limite conhecido ([ADR-0006](decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md)). Etapas posteriores são propostas, não funcionalidades entregues.

## Fase 0 — Diagnóstico e estrutura documental — concluída

- Inspecionar repositório e HTML; distinguir código existente de desejos futuros.
- Preservar fonte local sem publicar os dados pessoais do exemplo.
- Registrar produto, proposta de arquitetura, modelo de dados, decisões, regras de agents e memória.
- Definir etapas e validações para migrar sem perder o trabalho já realizado.
- Incorporar a decisão Railway/PostgreSQL, substituir a proposta inicial de framework e definir metas de rapidez, leveza e uso simples.

Aceite: documentos coerentes, referências locais válidas, cópia idêntica à fonte e próximo passo registrado. O diagnóstico é estático: interação visual do HTML ainda não foi verificada.

## Fase 1 — Base executável e contratos — concluída localmente

Entregue: workspace pnpm, SvelteKit/Vercel, API Hono/Node, Drizzle/pg, contratos Zod/JSON v1 e migração v3, exemplo fictício, tipos/lint/formatação/testes/build, CI, Compose PostgreSQL local e documentação de operação. Node 24 e versões compatíveis registradas no lockfile. Direção atual no ADR-0003.

Aceite local: página/API/proxy responderam, exemplo e download foram verificados no navegador; 25 testes passaram, sem erros de tipos/lint. JavaScript inicial da tela base: 36,80 KiB gzip. Veja [validação](validacao-fase1.md). O pacote Vercel completo aguarda Linux/CI (symlinks bloqueados no Windows); o banco real aguarda daemon Docker/infraestrutura. Better Auth e migrações de negócio pertencem à fase 3, sem stubs que finjam esses recursos.

## Fase 2 — Migrar o editor local — concluída

Entregue: domínio testável, editor `/editor`, landing `/`, formatos/curvatura/corredor/fileiras, convidados/busca/categorias, atribuição/troca, desfazer/refazer, rascunho local protegido, JSON novo/v3, PNG geral/individual e impressão. Exemplos são fictícios e não incluem regras familiares pessoais. [Relatório](validacao-fase2.md).

Atualização 08/11/2026: perfil do cenário máximo feito e benchmark ampliado (`scripts/bench-editor.js`) para formato, seleção de cadeira/pessoa, troca, filtro e busca. Após as otimizações (ADR-0005, SVG em pixels, lista com `content-visibility`), todas as ações ficaram com p95 ≤ 50 ms no desktop, primeiro sem pintura e depois com pintura (modo `frame`, painel visível: pior p95 37,1 ms). Celular físico (execução 1): formato 62 e filtro 57,6 ms de p95 acima da meta; filtro/busca e o script do formato foram otimizados; A/B no mesmo aparelho confirmou ganho em filtro/busca, mas quase todas as ações seguem em ~50–70 ms nesse celular. Decisão do usuário ([ADR-0006](decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md)): orçamento de 50 ms mantido, aceite pelo desktop de referência, celular testado registrado como limite conhecido; classe de celular de referência e otimização para aparelhos de entrada passam para a fase 5. Fase concluída; próxima: fase 3, contas e persistência entre dispositivos.

Aceite:

- Tradicional/meia-lua, corredor, fileiras e quantidades preservam a planta esperada.
- Mover/trocar lugares nunca duplica ocupantes; remover fileira mantém convidados sem lugar.
- Rascunho local, desfazer, nomes/data, busca, JSON legado e PNG completo/individual funcionam.
- Estados temporários de seleção e histórico não entram no arquivo persistido.
- Uma verificação visual em desktop e celular e um fluxo por teclado confirmam o uso básico; limitações são registradas.
- Medir a rota do editor e as ações locais nos conjuntos sintéticos; CSV/PNG ficam fora do carregamento inicial e mover/selecionar não depende de resposta da rede. Resultados e desvios das metas são registrados.

Trabalho paralelo possível após os contratos: domínio/geometria; interface/editor; importadores/exportadores. Cada agent fica com arquivos exclusivos; alterações em contratos são integradas pelo coordenador.

## Fase 3 — Contas e persistência na nuvem — concluída localmente; aceite hospedado pendente

Estado 08/11/2026 ([ADR-0007](decisoes/0007-contas-e-salvamento-transacional.md), [validação](validacao-fase3.md)): Better Auth (e-mail/senha), proxy same-origin, schema/migrações versionadas, roles runtime/migração, API de projetos por proprietário com revisão esperada e recibos de operação, telas `/conta` e `/projetos`, editor sincronizado com conflito visível e rascunho por conta/projeto. 36 testes integrados com PostgreSQL real passaram e o fluxo conta → projeto → salvar → conflito → cópia → isolamento entre contas foi verificado no navegador. Pendente, dependente de ambiente: cookies/origem Vercel↔Railway em HTTPS, SMTP real e reabertura em aparelho físico. Esses itens são verificados quando houver ambiente de teste (fase 5); a fase 4 pode começar.

Completar a preparação PostgreSQL com banco real, schema/migrações Drizzle versionadas, Better Auth, autorização por proprietário na API e operações transacionais. Implementar transporte frontend→API de autenticação/projetos e conectar o editor ao salvamento com revisão esperada e recuperação de falhas. Validar cookies/origem entre Vercel e Railway. Não provisionar/publicar como efeito colateral.

Aceite:

- Cadastro/login/logout/recuperação de acesso e sessão expirada têm fluxos verificáveis.
- Salvar e reabrir em outro dispositivo preserva convidados, planta e atribuições.
- Testes com duas contas bloqueiam leitura/escrita/exclusão cruzadas, inclusive chamadas diretas.
- Metadados, convidados, planta e atribuições mudam numa transação e numa única revisão.
- Dois dispositivos editando a mesma revisão geram conflito visível sem sobrescrita silenciosa.
- Falha de rede e resposta fora de ordem não produzem “salvo” falso; rascunhos ficam isolados por conta/projeto.
- Excluir projeto segue a autorização e elimina dependências; logs não incluem lista de convidados nem credenciais.
- Role de runtime sem superuser/DDL, migrações com credencial própria e banco privado em produção; o navegador só chama o backend. Esquema/IDs de autenticação seguem a biblioteca, sem pressupor UUID de usuário.
- Recuperação/verificação de e-mail só são declaradas funcionais após transporte configurado e fluxo testado; sessões, origem e cookies são verificados no ambiente com proxy da Railway.

Trabalho paralelo possível depois do contrato de persistência: autenticação; schema SQL/transações/autorização; integração do editor. O conjunto só está pronto após teste integrado entre contas e dispositivos.

## Fase 4 — Importações e exportações do produto — concluída localmente

Estado 08/11/2026 ([ADR-0008](decisoes/0008-importacao-csv-de-convidados.md), [validação](validacao-fase4.md)): CSV de convidados com prévia, detecção de separador/cabeçalho/codificação, mapeamento de colunas e categorias, aviso de duplicidade sem merge, erros por linha e confirmação explícita; lote numa única alteração/revisão. Importar JSON como novo projeto em `/projetos`. PNG sem mudanças nesta fase (cobertos pela fase 2). Pendentes: auditoria de acessibilidade/celular do diálogo CSV e medição da prévia com 1000 linhas (fase 5).

Adicionar CSV com prévia, mapeamento de colunas, política de duplicidade e validação. Completar o round-trip JSON contra o novo modelo e refinar exportações gerais e individuais. Preservar recursos já migrados na fase 2.

Aceite:

- Arquivos CSV UTF-8 com vírgula ou ponto e vírgula, aspas, BOM, acentos e nomes iguais têm resultado definido e prévia correta; nada é gravado antes da confirmação da prévia.
- Erros por linha e limites de bytes/registros são visíveis; categorias desconhecidas e duplicatas não são resolvidas silenciosamente.
- JSON desconhecido, grande demais ou com referências inválidas não altera o estado; JSON suportado preserva os dados num ciclo exportar/importar.
- Importar como novo projeto cria nova identidade e propriedade da conta atual; IDs de proprietário do arquivo nunca concedem acesso.
- PNG geral não corta a planta; individual é gerado a partir da projeção permitida, sem textos/metadados dos demais convidados. Há alternativa de download quando compartilhar não está disponível.

## Fase 5 — Preparar a primeira versão utilizável — implementação local; aceite final pendente

Entrega local em 08/11/2026: revisão do diálogo CSV e estados de projetos, retentativa de importação JSON com identidade preservada, exclusão de conta com senha exigida no servidor, limpeza local documentada, logs sem conteúdo privado, saneamento de analytics e procedimentos de backup/restauração. O usuário definiu Moto G84 como celular de referência; navegador/versão e ensaio físico pendentes. [ADR-0009](decisoes/0009-preparacao-da-primeira-versao.md), [validação](validacao-fase5.md), [operação](operacao.md).

Auditoria automatizada de acessibilidade (axe, WCAG 2.2 A/AA) feita em todas as telas, com lista alternativa à planta no editor; os alertas restantes estão explicados na [revisão](revisao-ui-fase5.md). UUID funciona em HTTP na rede local, o que destrava o ensaio no celular.

O marco continua aberto até o aceite hospedado, SMTP real, pacote Linux/Vercel, medições no Moto G84, ensaio real de restauração, teste com leitor de tela e definição de retenção/recursos. Nenhum ambiente remoto foi criado ou publicado.

Revisar acessibilidade (meta WCAG 2.2 AA, ver [PRODUCT.md](../PRODUCT.md)), responsividade, estados vazios/erros, limites e desempenho com conjuntos sintéticos. Definir ambientes, recuperação de dados, observabilidade sem dados pessoais, exclusão de conta e publicação.

Inclui, conforme o [ADR-0006](decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md): definir a classe de celular de referência (modelo identificado) e, se ela exigir, a otimização para aparelhos de entrada — atualização fina por cadeira/linha em troca e seleção, lista virtualizada se medida a necessidade e revisão das legendas da planta.

Aceite: fluxo completo em ambiente de teste, migrações reproduzíveis, isolamento verificado, metas de desempenho aferidas e procedimento de backup/restauração ensaiado com dados fictícios. Vercel para frontend e Railway para API/PostgreSQL já estão escolhidos; validar o pacote completo, healthcheck e migrações pré-deploy. Domínio, região, recursos, orçamento e qualquer publicação são tratados quando houver uma versão concreta.

## Fase 6 — Planta da festa — em execução

Pedido do usuário em 09/11/2026 ([ADR-0012](decisoes/0012-planta-da-festa.md)). Planejar a festa em salão fechado, dentro do mesmo projeto e com a mesma lista de convidados: salão com medidas reais, formato pronto ou criado manualmente; mesas com N cadeiras e convidados por mesa; DJ, pista, mesa de bolo, mesa de doces e outras atrações posicionadas livremente. O usuário pediu o início antes do aceite hospedado da fase 5, que continua pendente.

Etapas, nesta ordem por dependência:

1. Ensaio de arraste no Moto G84 com protótipo descartável, para confirmar a abordagem antes de construir o restante. **Página pronta (`scripts/bench-drag.html`). Em 10/11/2026 o usuário decidiu adiar a medição no aparelho e seguir para a etapa 4; ela continua exigida no aceite da fase (último item abaixo).**
2. Contrato JSON v2 com migração de v1/v3 e domínio puro: salão, mesas, elementos, atribuição por mesa e avisos. **Concluída.**
3. Persistência: migração do banco, atribuições por mesa e transação única com a cerimônia. Inclui o corte de `parseProjectFile`, rascunhos e API para v2. **Concluída localmente em 09/11/2026: migração `0004_reception` (renumerada de `0002` na integração com a `main` em 23/11/2026), v2 em contrato, API, editor, rascunhos e exportação; testes integrados com PostgreSQL. API e web precisam ser publicadas juntas (ver ADR-0012).**
4. Editor: alternância Cerimônia/Festa, salão, mesas, elementos, atribuição e alternativa sem arraste. **Implementada localmente em 10/11/2026, carregada sob demanda; conferida no navegador (desktop e emulação de celular) com rascunho local. Faltam: medir o cenário máximo, toque em aparelho real e o fluxo com conta pela web. Ajustes do usuário em 10/11: avisos em menu suspenso sem mudar a planta, seleção preservada ao surgir aviso, portas arrastáveis entre paredes e abertura para dentro, para fora ou de correr. Em 24/11: exportação da planta da festa em PNG com ou sem nomes (25/11) e opção "Ignorar avisos na planta" (os avisos seguem listados, sem destaque vermelho; preferência do aparelho).**
5. Saídas e fechamento: PNG, impressão, lista por mesa, acessibilidade e medições.

Depois do contrato, persistência e interface podem andar em paralelo com arquivos exclusivos; alterações de contrato ficam com o coordenador.

Aceite:

- Formato pronto e salão manual produzem a planta com as medidas informadas; salão inválido é recusado com mensagem clara e sem alterar o projeto.
- Projetos, rascunhos e arquivos JSON existentes abrem sem perda; exportar e importar v2 preserva salão, mesas, elementos e atribuições.
- Convidado nunca fica em duas mesas e a mesa nunca é sobrelotada sem aviso. Apagar mesa ou reduzir cadeiras explicita o efeito e mantém as pessoas na lista.
- Elemento fora do salão, sobreposição e passagem estreita geram aviso, e a interface deixa claro que o espaçamento é indicativo.
- O fluxo completo funciona no celular e por teclado sem depender de arrastar; existe alternativa em lista para leitor de tela.
- Duas contas continuam isoladas; salvar é uma única transação e revisão, com conflito visível entre dispositivos.
- Arquivos com referências, limites ou medidas inválidas não alteram o projeto.
- Arrastar e atribuir ficam com p95 ≤ 50 ms em build de produção no cenário máximo (100 mesas, 60 elementos, 300 convidados), medido também no Moto G84. O JavaScript inicial da cerimônia continua dentro do orçamento, com a festa carregada sob demanda.
- PNG e impressão não cortam o salão; a lista por mesa traz todos os convidados atribuídos.

## Fase 7 — Compartilhamento por link (visualização, edição e cópia) — etapas 1 a 3 integradas à main, etapa 4 implementada localmente; fechamento pendente; executa antes da fase 6

Pedido do usuário em 20–21/11/2026 ([ADR-0014](decisoes/0014-link-de-visualizacao.md) e [ADR-0016](decisoes/0016-compartilhamento-colaborativo-e-copia.md)). O dono cria links com nome e validade (7, 30, 90 dias ou sem prazo), e pode desativá-los a qualquer momento. Além dos modos públicos sem conta ("Com nomes" e "Só a planta"), o dono pode escolher modos autenticados para outras contas ("Permitir edição" do projeto original enquanto o link estiver ativo ou "Permitir cópia" independente na conta de destino). O número é 7 para não renumerar a festa, mas por decisão do usuário a execução vem antes dela, depois do aceite hospedado da fase 5.

Etapas, nesta ordem por dependência:

1. Contratos (entrada e projeção) e `toSharedView` puro, com testes de ausência de dados **Feito em 20/11/2026** ([contratos](contratos.md#links-de-compartilhamento-visualização-edição-e-cópia--fase-7)).
2. Tabela `project_share_links`, migração, token HMAC, rotas de gerenciamento e leitura pública, limite de requisições e allowlist do proxy. **Feito em 20/11/2026**, com testes integrados em PostgreSQL.
3. Página `/ver` com `PlanCanvas`/`SeatList` em modo somente leitura e busca "Encontre seu lugar"; painel "Compartilhar" no editor e em `/projetos`. **Feito em 21/11/2026**, verificado no navegador local (ver ADR-0014).
4. Colaboração autenticada e clonagem ([ADR-0016](decisoes/0016-compartilhamento-colaborativo-e-copia.md)): migração `0003_project_link_redemptions.sql` (`project_link_editors` e `project_link_clone_receipts`), `POST /api/shared/redeem`, papel `role: 'owner' | 'editor'` em listagem/leitura, página `/participar` com confirmação explícita e redirecionamento pós-login em `/conta`. **Feito em 21/11/2026**.
5. Fechamento: acessibilidade, celular (Moto G84), medição do bundle e runbook com `SHARE_LINK_SECRET`. Bundle medido, runbook feito e auditoria axe feita em 21/11/2026 (diálogo sem violações; `/ver` só com a regra das cadeiras aceita no ADR-0009). Faltam leitor de tela, Moto G84 e um teste pela hospedagem.

A distribuição de `/ver` foi revisada em 21/11/2026. O [guia da página](surfaces/ver.md) registra a composição responsiva.

Depois dos contratos, a API e as páginas de compartilhamento podem andar em paralelo com arquivos exclusivos.

Aceite:

- O link de visualização abre sem conta, em outra sessão e em outro aparelho, e mostra a última revisão salva.
- Nenhuma rota de escrita aceita o token diretamente como sessão; o token de visualização nunca altera nada, e os tokens `edit`/`clone` exigem sessão autenticada e modo correspondente em `POST /api/shared/redeem`.
- Link desativado, vencido, de modo trocado, de projeto excluído ou de conta excluída responde igual a um link inexistente (`404 not_found`).
- No modo `edit`, a conta convidada edita o projeto original com controle de revisão (`expectedRevision` + `operationId` por ator), não pode excluir o projeto nem gerenciar links, e perde o acesso assim que o link vence ou é desativado (inclusive se um salvamento concorrente aguardar o bloqueio da revogação).
- No modo `clone`, a conta destinatária recebe uma cópia independente da última versão salva (uma por link enquanto a cópia existir), que permanece na conta mesmo após o link vencer, ser desativado ou o original ser excluído.
- A resposta "Só a planta" não contém nenhum nome, nota ou ID de convidado. "Com nomes" não contém notas, convidados sem lugar, dono, revisão ou dados dos outros links. Os testes verificam o JSON serializado.
- O dono só lista, cria e desativa links dos próprios projetos. O limite de 10 links ativos se mantém com criações simultâneas.
- O token não aparece em logs da API nem da Vercel, nem em eventos de analytics.
- `/ver` e `/participar` não carregam código do editor, funcionam por toque e teclado e cumprem WCAG 2.2 AA na auditoria automatizada.

## Login com Google e exclusão de conta — implementado localmente; aceite hospedado pendente

Pedido do usuário em 21/11/2026 ([ADR-0015](decisoes/0015-login-com-google.md)). `/conta` passa a abrir com "Continuar com o Google" e deixa e-mail e senha como segunda opção. Contas só Google também podem ser excluídas, com login recente.

Aceite:

- Entrar e criar conta pelo Google na hospedagem real, com o cookie de sessão na origem da Vercel.
- Entrar pelo Google com o e-mail de uma conta por senha não abre essa conta. A tela orienta a entrar com a senha e conectar o Google.
- Uma conta só Google exclui a própria conta depois de confirmar com o Google, e projetos, links e o vínculo somem do banco.
- Quem tem senha continua precisando dela para excluir a conta.
- Sem as credenciais do Google, a tela funciona só com e-mail, sem erro.

Em 21/11/2026 foi concluída localmente a revisão de Minha conta e Meus projetos. A página inicial reconhece a sessão ativa e permite retomar os projetos depois de voltar ou recarregar. O aceite em HTTPS com Google continua pendente. [Validação da navegação](validacao-fase3.md#retorno-à-página-inicial-e-navegação-da-conta).

## Questões de produto para resolver no momento certo

| Questão | Padrão provisório | Quando resolver |
| --- | --- | --- |
| Uma ou duas contas do casal no mesmo projeto? | Resolvido na fase 7: visualização sem conta ([ADR-0014](decisoes/0014-link-de-visualizacao.md)) e edição compartilhada ou cópia independente entre contas por link ([ADR-0016](decisoes/0016-compartilhamento-colaborativo-e-copia.md)), sem compartilhar senha | Implementado localmente |
| Mais de uma planta/cenário por projeto? | Uma planta de cerimônia e, na fase 6, uma de festa por projeto; cenários alternativos seguem fora | Antes de oferecer cenários alternativos |
| Altas quantidades, dimensões reais e objetos livres? | Cerimônia preserva limites e geometria atuais; medidas reais e objetos livres entram na festa ([ADR-0012](decisoes/0012-planta-da-festa.md)) | Fase 6 |
| CSV: colunas, duplicatas e tamanho? | Nome obrigatório e categoria opcional; prévia sem merge automático por nome | Antes da fase 4 |
| Regras de proximidade e separação familiar? | Remover regras pessoais fixas; regras configuráveis posteriores | Fase 2; descoberta antes de expandir |
| Região, recursos e custos? | Railway + PostgreSQL definidos, região US East ([ADR-0013](decisoes/0013-infraestrutura-railway-como-codigo.md)); dimensionamento e orçamento pendentes | Antes de provisionar ambiente remoto/publicar |
| Como garantir leveza? | SvelteKit, poucas dependências e metas em `docs/desempenho.md` | Medir a base na fase 1 e o editor desde a fase 2 |

## Critério de conclusão de qualquer etapa

Código e documentação concordam; validações pertinentes são registradas; decisões têm status; `MEMORY.md` aponta o próximo trabalho real; nenhum agent fica com responsabilidade ambígua ao concluir a integração.
