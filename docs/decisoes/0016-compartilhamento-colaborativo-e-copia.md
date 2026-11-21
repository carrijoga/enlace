# ADR-0016 — Compartilhamento colaborativo com edição e cópia entre contas

Status: aceita e implementada localmente em 21/11/2026, a pedido do usuário. Estende o modelo de links do [ADR-0014](0014-link-de-visualizacao.md) com dois modos explícitos para destinatários autenticados: edição do projeto original (`edit`) e cópia independente na conta de destino (`clone`).

## Contexto

O [ADR-0014](0014-link-de-visualizacao.md) introduziu links públicos somente leitura (`/ver#<token>`) nos modos "Com nomes" (`names`) e "Só a planta" (`plan`). O usuário pediu que o compartilhamento por link também permita:

1. **Outros usuários modificarem o projeto original** (colaboração entre contas sem compartilhar senha);
2. **Outros usuários clonarem o projeto** para a própria conta como ponto de partida independente.

## Decisões

### 1. Quatro modos explícitos no mesmo mecanismo de links

O dono escolhe o que cada link permite ao criá-lo (`project_share_links.mode`), mantendo nome (1–60 caracteres), validade (7, 30, 90 dias ou sem prazo), revogação individual e o limite de 10 links ativos por projeto:

- `names` — Visualização pública com nomes e busca de lugares (`/ver#<token>`).
- `plan` — Visualização pública só da planta e ocupação (`/ver#<token>`).
- `edit` — **Permitir edição** (`/participar#edit.<token>`): exige conta autenticada; concede acesso de edição ao projeto original enquanto o link estiver ativo.
- `clone` — **Permitir cópia** (`/participar#clone.<token>`): exige conta autenticada; cria uma cópia independente da última versão salva na conta de quem abriu o link.

Modo, nome e validade continuam imutáveis após a criação. Um token criado para visualização (`names`/`plan`) é recusado na rota de resgate (`404 not_found`), e um token de participação (`edit`/`clone`) é recusado na rota pública `/api/shared/view` (`404 not_found`) e quando enviado com o modo trocado.

### 2. Token no fragmento e confirmação explícita em `/participar`

- Os links de edição e cópia usam a rota pré-renderizada `/participar#edit.<token>` ou `/participar#clone.<token>`, com `<meta name="robots" content="noindex, nofollow">` e `Referrer-Policy: no-referrer`.
- O fragmento nunca é enviado em requisições de página nem ao Vercel Analytics (`sanitizeAnalyticsEvent` limpa query e hash de `/participar`).
- Se a pessoa não estiver autenticada, `/participar` explica o convite em português e direciona para `/conta?next=/participar#edit.<token>`. Como o fragmento permanece no navegador durante a autenticação, `/conta` devolve a pessoa diretamente para `/participar#<modo>.<token>` após entrar ou criar a conta (`participationReturnPath`).
- **Sem efeito colateral no GET/carregamento:** abrir `/participar` não altera o banco automaticamente. O destinatário vê a conta conectada e confirma a ação num botão explícito (`POST /api/shared/redeem` com `{ token, mode }`), evitando resgates acidentais por pré-visualizadores de links.

### 3. Regras de edição compartilhada (`mode = 'edit'`)

- Confirmar o convite grava `(link_id, user_id)` em `project_link_editors` (idempotente para a mesma conta e link; se o próprio dono abrir o link, apenas retorna o `projectId` sem criar linha).
- Uma conta editora passa a ver o projeto em `GET /api/projects` e `GET /api/projects/:id` com `role: 'editor'` (o dono recebe `role: 'owner'`), e pode salvar alterações em `PUT /api/projects/:id` usando o mesmo controle transacional de concorrência (`expectedRevision` + `operationId` escopado por `actor_id` em `project_write_receipts`).
- **Acesso vinculado à vida do link:** toda leitura (`list`, `get`) e escrita (`save`) verifica se existe ao menos um link `edit` ativo (`revoked_at IS NULL` e `expires_at IS NULL OR expires_at > statement_timestamp()`) associado à conta em `project_link_editors`.
- **Serialização entre salvamento e revogação:** `revoke` e `save` bloqueiam a linha do projeto (`SELECT ... FOR UPDATE`). Em `READ COMMITTED`, se um salvamento de editor esperou pelo bloqueio de uma revogação concorrente, o `save` revalida a permissão após adquirir o bloqueio e recusa com `404 not_found` se o link acabou de ser desativado ou expirou.
- **Operações exclusivas do dono:** somente `owner_id` pode excluir o projeto (`DELETE /api/projects/:id`) ou listar, criar e desativar links de compartilhamento (`/api/projects/:id/share-links`). Na interface, `/projetos` e `/editor` identificam projetos com `role === 'editor'`, ocultam os botões de compartilhar e excluir para editores e oferecem salvar como novo projeto ou baixar o JSON caso o acesso termine com alterações locais abertas.

### 4. Regras de cópia independente (`mode = 'clone'`)

- Confirmar a cópia lê o snapshot consistente da última versão salva do projeto original (planta, convidados, categorias, lugares e observações) com a linha do projeto original bloqueada e revalidando que o link continua ativo.
- Cria um projeto novo (`insertProjectCopy`) com novo UUID, `owner_id` da conta destinatária, `revision = 1` e título prefixado com `Cópia de ` (truncado em 120 caracteres sem quebrar par substituto UTF-16). Links de compartilhamento e recibos do original não são copiados.
- **Idempotência por link e conta:** `project_link_clone_receipts (link_id, user_id, project_id)` garante que cliques repetidos ou chamadas concorrentes no mesmo link pela mesma conta devolvam o mesmo `projectId` já criado, sem duplicar projetos.
- Se o destinatário excluir a cópia depois (`ON DELETE CASCADE` em `project_id`), o recibo desaparece e ele pode gerar uma nova cópia caso o link ainda esteja ativo.
- **Independência após a cópia:** desativar o link, vencer o prazo ou excluir o projeto original remove o recibo em cascata, mas **não apaga nem altera** o projeto já copiado na conta de destino.

## Banco de dados e migração

Migração `0003_project_link_redemptions.sql`:

- amplia `project_share_links_mode_check` para `('names','plan','edit','clone')`;
- cria `project_link_editors (link_id, user_id)` com PK composta, FKs em cascata para `project_share_links` e `user`, e índice por `user_id`;
- cria `project_link_clone_receipts (link_id, user_id, project_id)` com PK `(link_id, user_id)`, `UNIQUE (project_id)`, FKs em cascata para `project_share_links`, `user` e `projects`, e índice por `user_id`.

## Consequências

- Colaboração assíncrona entre duas ou mais contas passa a funcionar com detecção de conflito por revisão, sem compartilhar senha e sem edição simultânea em tempo real (que permanece fora do escopo).
- O modo `edit` e o modo `clone` compartilham toda alista de convidados e observações do projeto com quem resgata o link autenticado; o diálogo "Compartilhar" exibe avisos específicos antes da criação e na confirmação de desativação.
- O contrato de transporte autenticado (`projectSummarySchema` e `projectSnapshotSchema`) passa a incluir `role: 'owner' | 'editor'`; o formato de arquivo JSON portátil (`schemaVersion: 1`) não muda.
