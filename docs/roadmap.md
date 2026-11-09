# Roadmap de implementação

Atualizado em 09/11/2026, com frontend Vercel e backend/PostgreSQL Railway. Fases 0 e 1 concluídas no escopo local. Fase 2 concluída em 08/11/2026: meta de desempenho atingida no desktop de referência; o celular de entrada testado ficou registrado como limite conhecido ([ADR-0006](decisoes/0006-aparelhos-de-referencia-e-aceite-da-fase-2.md)). Etapas posteriores são propostas, não funcionalidades entregues.

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

## Fase 6 — Planta da festa — proposta, não iniciada

Pedido do usuário em 09/11/2026 ([ADR-0012](decisoes/0012-planta-da-festa.md)). Planejar a festa em salão fechado, dentro do mesmo projeto e com a mesma lista de convidados: salão com medidas reais, formato pronto ou criado manualmente; mesas com N cadeiras e convidados por mesa; DJ, pista, mesa de bolo, mesa de doces e outras atrações posicionadas livremente. Início recomendado após o aceite hospedado da fase 5.

Etapas, nesta ordem por dependência:

1. Ensaio de arraste no Moto G84 com protótipo descartável, para confirmar a abordagem antes de construir o restante.
2. Contrato JSON v2 com migração de v1/v3 e domínio puro: salão, mesas, elementos, atribuição por mesa e avisos.
3. Persistência: migração do banco, atribuições por mesa e transação única com a cerimônia.
4. Editor: alternância Cerimônia/Festa, salão, mesas, elementos, atribuição e alternativa sem arraste.
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

## Questões de produto para resolver no momento certo

| Questão | Padrão provisório | Quando resolver |
| --- | --- | --- |
| Uma ou duas contas do casal no mesmo projeto? | Um proprietário; colaboração futura sem compartilhar senha | Antes de implementar convites/acesso compartilhado |
| Mais de uma planta/cenário por projeto? | Uma planta de cerimônia e, na fase 6, uma de festa por projeto; cenários alternativos seguem fora | Antes de oferecer cenários alternativos |
| Altas quantidades, dimensões reais e objetos livres? | Cerimônia preserva limites e geometria atuais; medidas reais e objetos livres entram na festa ([ADR-0012](decisoes/0012-planta-da-festa.md)) | Fase 6 |
| CSV: colunas, duplicatas e tamanho? | Nome obrigatório e categoria opcional; prévia sem merge automático por nome | Antes da fase 4 |
| Regras de proximidade e separação familiar? | Remover regras pessoais fixas; regras configuráveis posteriores | Fase 2; descoberta antes de expandir |
| Região, recursos e custos? | Railway + PostgreSQL definidos; dimensionamento e orçamento pendentes | Antes de provisionar ambiente remoto/publicar |
| Como garantir leveza? | SvelteKit, poucas dependências e metas em `docs/desempenho.md` | Medir a base na fase 1 e o editor desde a fase 2 |

## Critério de conclusão de qualquer etapa

Código e documentação concordam; validações pertinentes são registradas; decisões têm status; `MEMORY.md` aponta o próximo trabalho real; nenhum agent fica com responsabilidade ambígua ao concluir a integração.
