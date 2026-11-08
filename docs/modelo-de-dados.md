# Modelo de dados

Atualizado em 08/11/2026. Fase 3 em integração local: schema Drizzle, migrações SQL, Better Auth e serviço transacional PostgreSQL implementados. O formato portátil JSON v1 permanece o mesmo. Ver [ADR-0007](decisoes/0007-contas-e-salvamento-transacional.md), [arquitetura](arquitetura.md) e [validação fase 3](validacao-fase3.md).

PostgreSQL fica exclusivo ao backend. A interface usa o proxy same-origin; proprietário e sessão são determinados na API. Tabelas de autenticação seguem Better Auth: `user`, `session`, `account`, `verification` e `rateLimit`, com IDs textuais. Schema em `apps/api/src/auth-schema.ts` e `apps/api/src/db/schema.ts`; serviço em `apps/api/src/projects/store.ts`.

## Agregado de projeto

Um projeto reúne metadados do casamento, planta, convidados e atribuições. É a unidade de autorização, leitura consistente e controle de concorrência. A conta pode possuir vários projetos. O primeiro recorte tem um proprietário por projeto; associação de outras contas será uma evolução explícita.

| Entidade | Campos principais | Observações |
| --- | --- | --- |
| Identidade e sessão | Entidades da biblioteca Better Auth | Esquema revisado com a biblioteca; sem hashes/tokens próprios. O ID pode ser string e não é presumido UUID. |
| `projects` | `id`, `owner_id`, `title`, `couple_first`, `couple_second`, `wedding_date`, `layout_schema_version`, `layout`, `revision`, `created_at`, `updated_at` | ID do projeto UUID; `owner_id` referencia o usuário da biblioteca com tipo compatível. Data do casamento sem fuso, timestamps em UTC. `revision` inteira positiva, incrementada pela transação de escrita. |
| `guests` | `id`, `project_id`, `name`, `category`, `note`, `sort_order` | Nome não é único. Categorias iniciais preservam família, padrinho, madrinha, pajem e convidado. Notas são privadas. |
| `seat_assignments` | `project_id`, `seat_id`, `guest_id` | No máximo um convidado por cadeira e uma cadeira por convidado no projeto. |
| `project_write_receipts` | `project_id`, `operation_id`, `actor_id`, `request_hash`, `result_revision`, `created_at` | Recibo técnico de idempotência; não é histórico de conteúdo. `actor_id` tem o mesmo tipo do ID autenticado. |

`projects.layout` é JSONB com a estrutura geométrica: formato, curvatura, largura do corredor, preferência de edição vinculada, fileiras e suas cadeiras. Fileiras e cadeiras possuem UUIDs estáveis; índices de exibição não são identidade. Cada cadeira tem lado e ordem dentro da fileira. Corredor e altar têm posições calculadas a partir dos parâmetros no primeiro editor; objetos livres não entram implicitamente no contrato.

As listas de cadeiras são a fonte da quantidade por lado. Não persistir também totais independentes que possam divergir: o controle numérico da interface adiciona/remove cadeiras da lista. Coordenadas calculadas, total de lugares, quantidade de pessoas posicionadas, nome exibido da cadeira e cores de categoria são derivados.

### Fonte de verdade e integridade

- A planta persistida existe em `projects.layout`; não duplicar convidados ou atribuições dentro desse JSONB.
- A lista de pessoas autoritativa existe em `guests`; ocupação autoritativa existe em `seat_assignments`.
- Um snapshot de leitura ou arquivo JSON combina essas partes por conveniência. O snapshot não é uma segunda cópia gravada separadamente no banco.
- Criar restrições únicas para `(project_id, seat_id)` e `(project_id, guest_id)` em atribuições. A referência composta `(project_id, guest_id)` deve apontar a uma chave única de `guests` no mesmo projeto, impedindo referências entre projetos. Convidados e recibos também referenciam um projeto existente; a exclusão autorizada do projeto remove seus dependentes.
- Como `seat_id` aponta para um elemento JSONB, não há chave estrangeira simples para a cadeira. O serviço único de escrita no backend valida existência da cadeira no layout, unicidade dos IDs, pertencimento e consistência das referências antes do commit. Todos os caminhos de alteração do agregado passam por esse serviço e sua transação; não há escrita direta pelo navegador. Se for necessário escrever cadeiras independentemente no futuro, normalizá-las em tabela e migrar o contrato.
- Excluir um convidado remove sua atribuição, sem remover a cadeira. Remover uma cadeira/fileira desfaz as atribuições correspondentes, preservando convidados. A interface avisa o impacto antes de uma alteração destrutiva de estrutura.
- Trocar ordem, formato ou curvatura preserva os IDs e suas ocupações. Uma cadeira removida e posteriormente recriada recebe um novo ID; desfazer pode restaurar o snapshot anterior e seus IDs se ainda não houver conflito de revisão.
- `linkedCounts` descreve como o próximo comando de edição é aplicado; não é uma exigência de simetria permanente. O modelo legado admite lados assimétricos com a opção vinculada ligada.

Manter limites iniciais compatíveis com a capacidade observada do protótipo: 1–12 fileiras, 0–12 cadeiras por lado/fileira e até 300 convidados. Esses limites precisam ser aplicados também aos caminhos de cadastro e lote, não só à importação. Rever os números após testar desempenho e UX. Comprimentos de campos, corredor, curvatura, tamanho máximo e notas estão formalizados nos contratos executáveis; cliente e servidor validam o mesmo agregado.

## Identidade, acesso e conexão

Better Auth executa no servidor da API; a sessão é validada no backend e identifica o usuário por operação. Tabelas de autenticação devem seguir esquema gerado e revisado, com migrações versionadas. Não criar tabela paralela de senhas nem mecanismo próprio de tokens. O frontend deve encaminhar requisições autenticadas pelo seu domínio para API, evitando cookies third-party entre domínios Vercel/Railway. Validar origem/CSRF e cookies no desenho final; CORS não concede autorização. A integração de referência é a [documentação do adaptador Drizzle](https://www.better-auth.com/docs/adapters/drizzle).

Toda consulta de projeto deve incluir o ID autenticado, além do ID do projeto: carregamento, listagem, atualização, exclusão, importação, convidados, atribuições e recibos. Para consultar uma tabela filha, restringir o acesso pelo projeto e seu proprietário no mesmo acesso ao banco. Nunca aceitar `owner_id` ou `actor_id` do corpo da requisição como identidade. Um projeto inexistente e um projeto inacessível não devem expor dados para distinguir seus proprietários.

Índices iniciais: projetos por proprietário e ordenação da lista; convidados por projeto; atribuições pelas duas restrições únicas; recibos por projeto, ator e operação. Definir a chave única de idempotência como `(project_id, actor_id, operation_id)` e indexar a data quando houver limpeza por retenção. Não adicionar índices sem um caminho de consulta correspondente.

Usar um pool `node-postgres` reutilizado pelo processo do servidor, com limite de conexões definido para a capacidade do banco e quantidade de instâncias. Credenciais ficam apenas no ambiente do servidor. Separar o papel de execução, sem superusuário nem permissões de DDL, do papel usado por migrações. A aplicação precisa das permissões de dados estritamente necessárias para seus próprios serviços e para a biblioteca de autenticação.

O isolamento é feito pela autorização centralizada na API e pelas restrições PostgreSQL; nem Railway nem PostgreSQL fornecem autorização de usuário automaticamente. Não há `auth.uid()` ou RLS automática neste desenho; RLS não é dependência do MVP. Se adotada como camada adicional, exige políticas próprias e contexto de usuário seguro na mesma transação/conexão, sem persistir identidade entre requisições que compartilham o pool. Testes de acesso cruzado serão obrigatórios independentemente de RLS. As rotas `/api/projects` e `/api/auth/*` têm testes integrados com banco real.

## Escrita atômica e revisão

Entrada conceitual de salvamento: `projectId`, `expectedRevision`, `operationId` e agregado editável completo. `owner_id`, `actor_id`, `revision` resultante e timestamps são controlados pelo servidor/banco. O ID de um projeto não é autorização. O serviço de aplicação abre uma transação Drizzle usando a mesma conexão do pool até o commit/rollback; operações soltas em conexões diferentes não formam uma transação.

Dentro de uma única transação:

1. Obter a identidade da sessão validada no servidor. Selecionar o projeto por `id` e `owner_id`, bloqueando sua linha com `SELECT ... FOR UPDATE` durante a alteração. Rejeitar sem efeitos se não houver acesso.
2. Procurar recibo da operação no mesmo projeto/ator. Se já concluída com o mesmo hash da requisição, retornar a revisão registrada; se o conteúdo difere para o mesmo ID, rejeitar a reutilização.
3. Comparar `expectedRevision` com a revisão atual; em divergência, retornar conflito sem alterar dados.
4. Validar o agregado, incluindo IDs, referências, limites e pessoas únicas por cadeira.
5. Substituir/atualizar a planta e reconciliar convidados/atribuições com o mesmo projeto. Operações de troca devem respeitar as restrições únicas durante a transação, por exemplo removendo as atribuições afetadas antes de inserir as novas.
6. Incrementar `revision` uma vez, atualizar timestamp e registrar o recibo. Confirmar tudo junto ou desfazer tudo em caso de erro.

Leitura deve devolver um agregado consistente com a revisão informada: usar uma consulta única ou uma transação de leitura `REPEATABLE READ` na mesma conexão, com autorização por proprietário. Evitar montar partes com várias requisições sujeitas a revisões diferentes. Retentativas reutilizam o ID de operação apenas para a mesma requisição. Uma nova alteração gera outro ID.

Os recibos precisam de retenção definida antes de liberar sincronização; sugestão inicial: sete dias. O cliente não reenvia automaticamente operações mais antigas sem antes recarregar o projeto. Se o recibo tiver expirado e o banco avançou, o CAS produz conflito seguro. Para criação/importação de um novo projeto, usar ID UUID gerado no cliente e criação idempotente autorizada; uma repetição não deve duplicar projetos. Não confundir recibos com backups ou histórico restaurável, que exigem política própria.

## Documento JSON portátil

O formato implementado em `packages/contracts` começa em `schemaVersion: 1`, separado da `revision` do banco e do `version: 3` legado. `projectDocumentSchema` e `ceremonyProjectSchema` definem o envelope/nomes, limites, UUIDs, enums, datas reais e referências de cadeira/convidado. `parseProjectFile` valida JSON v1 e encaminha v3 ao adaptador explícito. Compile contracts antes dos consumidores (`dist` é o export de runtime). A API persiste o agregado validado; o envelope portátil não entra no banco.

| Incluído no arquivo | Excluído do arquivo |
| --- | --- |
| Título, casal e data; parâmetros, fileiras e cadeiras; convidados e atribuições; IDs necessários às referências internas | Sessão, tokens, senha, proprietário da conta, permissões, recibos, URLs privadas e estado de sincronização |

O arquivo inclui dados pessoais dos convidados por ser um backup do projeto; a interface deve deixar isso claro no momento de exportar. Estados temporários de UI e histórico de desfazer ficam de fora.

Na importação, validar versão suportada, tipos, limites, enumerações, datas reais, UUIDs únicos e todas as referências. Não aceitar propriedades executáveis, HTML ou comportamento embutido. Versões futuras desconhecidas geram erro explicável; não tentar reinterpretá-las como o formato atual. Campos desconhecidos seguem uma política explícita do schema, com rejeição ou remoção controlada; não espalhar objetos externos diretamente no estado.

Por padrão, importar cria um novo projeto e remapeia IDs de projeto, fileiras, cadeiras e convidados; reescrever todas as referências em conjunto. Propriedade e revisão são locais ao destino. Substituição de projeto existente só poderá ser adicionada com prévia de impacto, confirmação explícita e a mesma proteção de revisão.

### Adaptador do protótipo

O HTML observado exporta `version: 3`, `couple`, `weddingDate`, `aisleWidth`, `linkedCounts`, `mode`, `curveStrength`, `rows`, `people` e `assignments` (fonte, linhas 177–203 e 339–341). Ele também tenta carregar uma chave local denominada v1; isso não comprova um schema v1 documentado. A compatibilidade com formatos anteriores deve depender de fixtures reais e validadas.

Para arquivos v3:

1. Reconhecer explicitamente a estrutura legada e validá-la sem chamar o código importado.
2. Mapear `curve`/`straight` aos modos internos escolhidos, preservando curvatura, corredor e assimetria.
3. Criar IDs estáveis para cada fileira e cada cadeira. Chaves `L-<fileira>-<índice>` e `R-<fileira>-<índice>` são coordenadas legadas, não identidades permanentes.
4. Criar novos IDs para pessoas e manter um mapa de IDs antigos para novos. Nomes podem repetir; IDs antigos duplicados tornam referências ambíguas e devem gerar erro ou correção explícita na prévia.
5. Converter cada atribuição pela chave da cadeira e mapa de pessoas, rejeitando ou apresentando problemas de referências inexistentes e ocupações duplicadas antes da gravação.
6. Importar somente os dados presentes. Não preencher convidados, data de casamento ou regras pessoais com os defaults do HTML original. Campos opcionais ausentes usam defaults neutros documentados; campos obrigatórios faltantes pedem correção.

O adaptador não transporta a lógica de avisos familiares fixos nem interpreta nomes/notas como regras. Antes de declarar compatibilidade, preparar fixtures sintéticas de v3, assimetria, acentos, lista vazia, lugares inválidos, duplicações e limites. A migração deve produzir os mesmos lugares válidos e informar perdas/ajustes, sem descarte silencioso.

## CSV de convidados

Implementado conforme [ADR-0008](decisoes/0008-importacao-csv-de-convidados.md) (o lote é aplicado no editor e salvo pela revisão normal do projeto, sem rota própria). Contrato inicial sugerido: `nome` obrigatório; `categoria` e `observacao` opcionais, com mapeamento na prévia. Usar parsing de CSV real, UTF-8 com suporte a BOM e separador selecionável. Categorias desconhecidas pedem correção ou mapeamento; campo vazio pode usar `convidado` conforme escolha mostrada na prévia.

Não usar nome como chave de deduplicação. Cada linha válida recebe novo ID. Mostrar possíveis duplicações como aviso, respeitar convidados com o mesmo nome e confirmar o lote antes de gravar. Aplicar o lote em uma transação com a revisão do projeto, sem mudanças na planta e sem atribuir lugares automaticamente. Reenviar a mesma operação não pode criar convidados em dobro.

## Dados locais e exportação individual

O rascunho local contém `userId`, `projectId`, revisão-base, conteúdo pendente e data; seu escopo precisa impedir vazamento entre contas. Não guardar tokens junto do rascunho. Não considerar cache local como cópia de segurança garantida.

Criar uma projeção própria para exportação individual: geometria necessária do mapa, cadeira destacada, nome do destinatário e identificação do casal/data permitidas. A projeção não inclui outros convidados ou notas, sequer em atributos e metadados. Testar essa ausência antes da rasterização; PNG não deve ser usado como justificativa para manter dados desnecessários no SVG intermediário.

## Evoluções previstas sem antecipar implementação

- `project_members` e convites para acesso de duas contas ao mesmo projeto.
- Histórico de versões e recuperação, com retenção e restauração transacional.
- Grupos familiares e restrições de posição configuráveis, se validados como necessidade do produto.
- Normalização das cadeiras caso sejam editadas/consultadas independentemente da planta.
- Links de visualização individual com tokens limitados e revogáveis, caso o produto venha a oferecer compartilhamento por URL.
