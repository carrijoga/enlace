# Arquitetura

Atualizado em 07/11/2026. **Status: fase 1, base executável local concluída, com limites na validação.** Frontend Vercel e API + PostgreSQL Railway, conforme [ADR-0003](decisoes/0003-frontend-vercel-api-railway.md). Supabase descartado; o ADR-0002 preserva a proposta anterior. Evidências em [validacao-fase1.md](validacao-fase1.md), diagnóstico histórico em [diagnostico-prototipo.md](diagnostico-prototipo.md) e modelo em [modelo-de-dados.md](modelo-de-dados.md).

## Objetivo e primeiro recorte

Transformar o planejador pessoal em uma aplicação em que uma pessoa possa entrar na conta, criar projetos de cerimônia, organizar convidados e retomar o trabalho em outro dispositivo. O editor deve preservar os formatos tradicional e meia-lua, fileiras assimétricas, corredor, atribuição e troca de lugares, desfazer e exportações existentes.

No primeiro produto, cada projeto tem um único proprietário. A conta pode ser usada pelo proprietário em mais de um dispositivo; edição compartilhada entre contas do casal exige uma etapa posterior, com convites e permissões. Não pressupor que compartilhar credenciais seja a solução de colaboração. Coedição simultânea, links públicos, cobrança e organização de recepções não integram esse primeiro recorte.

## Stack e justificativa

| Parte | Recomendação | Motivo |
| --- | --- | --- |
| Frontend | SvelteKit 3, Svelte e TypeScript em `apps/web`, `@sveltejs/adapter-vercel` | Interface web hospedada na Vercel. O bootstrap atual é uma página de demonstração/contratos, não o editor completo. |
| API | Hono + `@hono/node-server` em Node.js na Railway | Serviço separado para endpoints; no bootstrap implementa somente `/health` e `/ready`. |
| Persistência | PostgreSQL na Railway; Drizzle ORM + `pg` no servidor da API | Pool compartilhado por processo configurado, mas ainda sem tabelas nem migrations reais. |
| Contas | Better Auth é uma opção planejada, ainda não instalada nem integrada | Sessões, autenticação e migrações próprias serão definidas na fase 3. |
| Contratos | `packages/contracts`, Zod e exports de runtime em `dist` | Schemas compartilhados; compilar antes dos consumidores. |
| Planta | SVG gerado de dados e funções de geometria | Preservar a abordagem do protótipo, o foco por cadeira e a exportação vetorial intermediária. |
| Estilos e estado de tela | CSS dos componentes, tokens CSS e reatividade nativa do Svelte | Começar com poucas dependências, sem kit visual completo ou biblioteca global de estado. |
| Validação | Contratos de execução compartilhados entre cliente, servidor e importadores | TypeScript sozinho não valida arquivos ou requisições; schemas executáveis ficam em `@enlace/contracts`. |
| Verificação | Testes de domínio, integração do banco e fluxos críticos no navegador | Cobrir geometria/atribuições, isolamento de contas, concorrência e persistência real. |

Vercel para frontend e Railway/PostgreSQL para API e banco são a direção vigente. Configuração Railway/Vercel e Compose local estão preparados; nenhum serviço remoto foi provisionado. Drizzle/`pg` integram a API, sem schema/migração ou Better Auth. A tela base mediu 36,80 KiB gzip; editor e banco real ainda não têm benchmark. Região, recursos, orçamento, domínio e transporte de e-mail permanecem pendentes.

Svelte compila componentes para JavaScript; SvelteKit oferece separação de código por rota e carregamento seletivo. Isso favorece a direção pretendida, mas não garante por si só um produto mais rápido que uma aplicação React bem implementada. A aceitação será pelas medições descritas em [desempenho.md](desempenho.md), com orçamento de JavaScript, tempo de resposta da edição e fluxo simples no celular.

O monorepo pnpm e a API separada foram adotados para permitir Vercel no frontend e Railway no backend. A página web usa `/api/health` como proxy same-origin para `/health` da API, com origem da API em variável de ambiente; esse proxy não contém regra de negócio. Proxies de autenticação/projetos são trabalho futuro. A API expõe somente endpoints de saúde no bootstrap.

## Estrutura atual e fronteiras dos pacotes

```text
apps/
  web/                     # SvelteKit 3 + adapter-vercel; /api/health proxy
    src/routes/             # página inicial e endpoint de proxy
  api/                     # Hono Node + @hono/node-server
    src/app.ts              # factory de app e health/readiness
    src/server.ts           # listener, porta e encerramento gracioso
    src/database.ts         # pool pg lazy e Drizzle (sem schema)
    src/config.ts           # env e validação de origem/produção
packages/
  contracts/               # Zod schemas, parser JSON e migração v3
  domain/                  # futuro: geometria e invariantes puras
docker-compose.yml         # PostgreSQL local para desenvolvimento
railway.toml               # build/start/healthcheck do serviço API
prototypes/private/        # referência original local, ignorada pelo Git
```

`apps/web` consome contratos por `workspace:*`; como os exports de runtime apontam para `dist`, compilar `@enlace/contracts` antes dos consumidores. A página web atual importa contratos sob demanda para demonstração/JSON; não há editor completo. `apps/api` mantém porta/servidor separados da factory testável. O pool PostgreSQL é criado apenas quando usado. Não existem ainda tabelas ou migrations. Não criar estrutura vazia para áreas futuras.

## Responsabilidades

**Navegador (responsabilidade planejada para o editor):** manter o rascunho editável, executar comandos de domínio, calcular a geometria, renderizar SVG, selecionar pessoas/cadeiras, apresentar erros de arquivo, gerar imagens e solicitar salvamento. O editor ainda não está migrado. Estado temporário de interface — seleção, zoom, filtro, diálogos e histórico de desfazer — não compõe o documento persistido. Usar texto escapado no HTML/SVG; nunca tratar nomes ou arquivos importados como marcação executável.

**Web Vercel:** renderizar a interface e encaminhar chamadas pelo próprio domínio do frontend. O proxy atual `/api/health` encaminha somente para `API_ORIGIN/health`, sem regra de negócio. Planejar o transporte same-origin também para autenticação/projetos; isso evita depender de cookies third-party entre domínios Vercel e Railway. Credenciais da API e do banco nunca vão ao cliente.

**API Railway:** conferir entrada, impor limites e, quando existir autenticação, validar sessão e autorizar por proprietário antes de cada leitura/escrita. No momento há somente health/readiness; sessão, usuários e projetos não estão implementados. `DATABASE_URL` fica no servidor. Nunca confiar em `ownerId`, permissões ou revisões enviados pelo cliente como prova de autorização. Não compartilhar estado de usuário em variáveis globais Node.

**Banco:** ser a fonte de verdade das versões salvas; garantir chaves, restrições, atomicidade e concorrência. Autorização por conta é responsabilidade explícita do backend, apoiada por consultas escopadas e permissões mínimas da role de banco. Os formatos JSON e a cache local não concedem acesso a um projeto.

**Domínio puro:** receber dados e comandos e devolver o próximo estado ou erros, sem acessar DOM, rede ou armazenamento. Reaproveitar aqui as regras de ocupação e o cálculo de lugares; remover regras familiares fixas do protótipo. Regras configuráveis de proximidade/separação ficam para evolução posterior.

## Identidade e autorização — desenho futuro

1. **Futuro (fase 3):** avaliar/instalar Better Auth para credenciais, sessões persistidas e recuperação de conta, com esquema gerado e migrações revisadas. Não está instalado ou implementado. E-mail exige transporte configurado.
2. Encaminhar chamadas do browser via origem Vercel para API Railway. Assim cookies são same-origin; validar `Origin`/CSRF no backend e configurar cookies HttpOnly/Secure, SameSite, expiração e revogação conforme o fluxo real. CORS não substitui autenticação nem CSRF.
3. Escopar todas as leituras e alterações por `project_id` e `owner_id` da sessão, incluindo convidados, atribuições, recibos, exportações e exclusão. Não basta proteger o layout da página. Um identificador conhecido não concede acesso.
4. Concentrar alterações do agregado em um serviço de aplicação que autoriza, bloqueia a linha do projeto, compara a revisão e escreve tudo na mesma transação/conexão. Não usar RPC pública nem função privilegiada como requisito inicial.
5. PostgreSQL fica acessível apenas ao backend, preferencialmente pela rede privada Railway. Usar role de runtime sem superuser/DDL e credencial separada para migrações. Não há acesso direto do navegador nem RLS automática por usuário; não há `auth.uid()` no PostgreSQL comum. RLS adicional pode ser avaliada depois, com contexto transacional explícito e testes próprios.
6. Para colaboração futura, adicionar `project_members` e papéis de proprietário/editor/leitor, revisando o serviço de autorização e os testes antes de expor convites.

## Salvamento, falhas e múltiplos dispositivos — desenho futuro

Nenhum desses fluxos está implementado no bootstrap: ainda não há sessão, projeto persistido, autosave ou API de projeto.

O editor carrega um snapshot consistente do agregado e sua `revision`. Cada alteração válida atualiza imediatamente o rascunho. O autosave agrupa alterações com um pequeno intervalo e envia `expectedRevision`, um identificador de operação e o documento validado. O tempo de espera será calibrado na implementação.

Uma transação no serviço de persistência compara a revisão atual com `expectedRevision`, valida todo o agregado e grava planta, convidados, atribuições e metadados em conjunto. Somente então incrementa a revisão e confirma a nova versão. Não fazer requisições independentes para salvar cada tabela; todas as consultas da transação usam a mesma conexão do pool.

Manter no máximo um salvamento em andamento por projeto no cliente. Alterações feitas durante a requisição permanecem pendentes; ao receber a confirmação, atualizar a revisão e enviar o próximo rascunho. Uma confirmação de um snapshot anterior não deve marcar as mudanças posteriores como salvas.

Se outro dispositivo tiver salvado primeiro, retornar conflito e preservar o rascunho local. Oferecer recarregar a versão remota ou salvar o rascunho como outro projeto; adiar mesclagem automática. Não aplicar a regra silenciosa de “última gravação vence”. Alterações locais de desfazer também viram um novo salvamento sujeito à revisão; não diminuem a revisão do banco.

Em erro de rede, mostrar “alterações pendentes” ou “sem conexão”, preservar a última versão confirmada e guardar um rascunho local de recuperação, por usuário e projeto. A implementação inicial pode usar IndexedDB para esse rascunho, sem prometer sincronização offline completa. Falha de quota/armazenamento local deve ser visível e deixar disponível a exportação JSON. Na reconexão, comparar revisões antes de reenviar; sessão expirada exige reautenticação. Remover a cache e o estado em memória na saída da conta; dados de outro usuário nunca devem reaparecer.

Não depender de uma gravação ao fechar a aba. O indicador “salvo na nuvem” só aparece após confirmação do banco. Para uma confirmação perdida na rede, o identificador de operação permite reconhecer uma tentativa já concluída sem repetir uma criação/importação; seu escopo e retenção constam do modelo de dados.

## Importação e exportação

O pacote `@enlace/contracts` já implementa schemas Zod para projeto/documento JSON v1 e parser para JSON v1 e legado v3. A página web usa os contratos em demonstração e não é um editor migrado. CSV, persistência de projetos e exportações PNG descritas abaixo são requisitos/desenhos futuros.

**CSV de convidados:** ler com parser que respeite campos entre aspas, separadores e quebras de linha. Mostrar prévia, mapeamento de colunas e erros por linha antes de aplicar; permitir vírgula/ponto e vírgula e detectar BOM UTF-8. Colunas iniciais: nome obrigatório e categoria/observação opcionais. Nomes repetidos são possíveis e não devem ser excluídos automaticamente. Validar tamanho total, quantidade de registros, comprimento e enumerações no cliente e no servidor. Importar em lote atômico no projeto selecionado, sem alterar cadeiras. A importação adiciona convidados; atribuição automática e substituição de lista ficam fora do primeiro contrato. Não executar fórmulas ou HTML vindos de células.

**JSON do projeto:** formato próprio com `schemaVersion`, importação estrita e migrações explícitas. Exportar o agregado de domínio, sem sessão, chaves, propriedade remota ou histórico de sincronização. Importar cria um novo projeto por padrão, com novos IDs e remapeamento de referências; mostrar prévia/erros antes de gravar. Não enviar dados incompletos ou inválidos parcialmente ao banco. O protótipo `version: 3` usa outro contrato: passar por um adaptador específico, sem confundir esse número com o novo `schemaVersion`.

**Imagem completa:** gerar uma composição SVG a partir do snapshot validado da planta inteira e rasterizar para PNG com limites de dimensões/memória. O enquadramento usa os limites da planta, não apenas o que está visível no viewport. Mostrar falha de geração e manter a opção de impressão.

**Imagem individual:** construir um modelo de exportação reduzido que contenha só os dados do destinatário, o casal/data autorizados e a geometria necessária. Não copiar todo o DOM com dados de outros convidados para depois ocultá-los visualmente. Excluir nomes, notas, IDs pessoais, `aria-label`, `title` e metadados dos demais participantes. Gerar arquivo local; compartilhamento pelo sistema do dispositivo é uma ação explícita. Links públicos e armazenamento de imagens na nuvem ficam para outra etapa.

## Migração incremental e critérios de verificação

1. Registrar o protótipo como referência privada e preparar fixtures sintéticas; nunca publicar sua lista pessoal como seed/demo.
2. Extrair contratos, comandos de ocupação e geometria antes de conectar o banco. Comparar os dois formatos, assimetria, troca de lugares e remoção de fileiras.
3. Reconstruir o editor preservando os fluxos existentes; separar configuração visual de identidade de convidados. O altar atual é decorativo/fixo: edição livre de altar/objetos exige requisito adicional.
4. Adicionar autenticação e persistência com autorização no backend, permissões de banco e transações testadas. Verificar dois usuários isolados, sessão expirada, falha de rede e duas abas/dispositivos com a mesma revisão.
5. Conectar migração JSON, CSV e exportações. Validar ida e volta do JSON, arquivos inválidos sem perda, caracteres acentuados e ausência de dados alheios no modelo da imagem individual.
6. Verificar uso por toque, teclado, desktop e celular. Validar a planta completa exportada, inclusive no maior tamanho suportado.

O bootstrap local está validado nos limites do relatório da fase 1. A aplicação só poderá ser chamada de sincronizada entre dispositivos após os fluxos autenticados serem implementados e verificados com persistência real.

## Referências técnicas

Documentação oficial de referência consultada em 07/11/2026. Revalidar comandos e integrações ao atualizar versões; não misturar exemplos de versões diferentes.

- [Svelte: compilação de componentes](https://svelte.dev/docs/svelte/overview).
- [SvelteKit: estrutura do projeto](https://svelte.dev/docs/kit/project-structure), [adapter Vercel](https://svelte.dev/docs/kit/adapter-vercel), [desempenho](https://svelte.dev/docs/kit/performance) e [estado no servidor](https://svelte.dev/docs/kit/state-management).
- [Hono: execução em Node.js](https://hono.dev/docs/getting-started/nodejs).
- [Railway: PostgreSQL](https://docs.railway.com/databases/postgresql), [rede privada](https://docs.railway.com/networking/private-networking) e [configuração como código](https://docs.railway.com/config-as-code/reference).
- [Drizzle: PostgreSQL com node-postgres](https://orm.drizzle.team/docs/get-started/postgresql-new).
- [Better Auth: SvelteKit](https://better-auth.com/docs/integrations/svelte-kit) e [adapter Drizzle](https://better-auth.com/docs/adapters/drizzle).

## Hospedagem e operação

- Frontend SvelteKit publicado na Vercel; serviço Node/Hono API e PostgreSQL na Railway. O `railway.toml` configura build/start/healthcheck da API. O desenvolvimento usa PostgreSQL local via Compose. Nenhum recurso remoto foi criado.
- Build sem acesso ao banco de produção; migrações revisadas executadas em etapa pré-deploy com rede privada, timeout e credencial adequada. A versão do app deve permanecer compatível com a migração enquanto a versão anterior ainda atende usuários.
- A API respeita `PORT`, valida `WEB_ORIGIN` e exige origem HTTPS e `DATABASE_URL` em produção. `/health` não depende do banco; `/ready` verifica conexão e responde genericamente `503` em falha. A API já configura limite de corpo de 2 MiB e encerra o pool no shutdown.
- Pool compartilhado por processo, com teto de conexões dimensionado para o total de réplicas. Nunca abrir uma nova conexão por clique nem executar migração por requisição.
- Projetos vivem no PostgreSQL; JSON/PNG são gerados para download, sem depender de arquivos gravados no disco efêmero da aplicação. Backups, retenção e restauração serão configurados e ensaiados antes da primeira versão publicada.
