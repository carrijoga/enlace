# Validação da fase 3 — contas e persistência (escopo local)

Atualizado em 08/11/2026. Ambiente: Windows 11, Node 24.22.1, PostgreSQL 17 em Docker local (`docker-compose.yml`), API Hono em `localhost:3011`, web Vite dev em `localhost:5183` com proxy same-origin. Dados e contas fictícios (`@example.test`). Nenhum recurso remoto criado.

## Verificações automatizadas

| Verificação | Resultado |
| --- | --- |
| `pnpm run check` | 0 erros, 0 avisos (o aviso `rawAccountDraft` sem `$state` foi corrigido; era um bug real: o bloco de recuperação do rascunho corrompido da conta não aparecia) |
| `pnpm run lint` / `format:check` | aprovados após remover import não usado e formatar 13 arquivos |
| `pnpm test` sem banco | 64 testes passaram, 14 integrados ignorados explicitamente |
| `TEST_DATABASE_URL=… vitest run apps/api` | 35 passaram (6 arquivos): duas contas por chamada direta, sessões reais, logout/sessão expirada, recuperação de senha com entrega capturada, concorrência, confirmação perdida, rollback por restrição, exclusão por proprietário/revisão, role runtime sem DDL e sem acesso ao ledger, cookies `Secure/HttpOnly/SameSite=Lax` em origem de produção |
| `TEST_CREATE_DATABASE=1` | baseline de migração aplicada uma vez e idempotente |

## Fluxo no navegador (via proxy da web)

1. `/conta` → criar conta → redireciona para `/projetos` vazio.
2. "Criar primeiro projeto" → `/editor?project=UUID`, estado "Salvo na sua conta".
3. Alterar cadeiras → "Sincronizando…" → "Salvo na sua conta"; `GET` confirma revisão 2 com a mudança.
4. Outro "dispositivo" grava revisão 3; edição local com revisão 2 → "Conflito de versões", rascunho preservado, opções carregar/salvar como novo/baixar JSON. Nenhuma sobrescrita.
5. "Salvar como novo projeto" → cópia revisão 1 com as mudanças locais; lista mostra os dois projetos.
6. Sair → `GET /api/projects` 401. Conta B: lista vazia; `GET`/`DELETE` do projeto da conta A → 404.
7. Conta B abrindo URL do projeto de A → tela "Projeto indisponível" com link para os projetos. Sem sessão → "Entre para abrir este projeto" com link para entrar.

O passo 7 foi corrigido nesta revisão: antes a tela ficava em "Preparando seu espaço…" e mostrava um aviso de "Tentar sincronizar" sem nenhuma edição. O rótulo de falha remota passou de "Não foi possível salvar neste navegador" para "Não foi possível sincronizar".

## Limites e pendências

- Cookies/origem entre Vercel e Railway, HTTPS real e proxy da Railway não verificados (sem ambiente hospedado).
- Recuperação de senha só testada com entrega capturada; sem SMTP real, a interface a declara indisponível.
- Reabrir em outro dispositivo físico não foi feito; coberto por teste integrado com segunda sessão.
- Rascunhos da conta continuam no `localStorage` após sair (chave por usuário/projeto, inacessíveis a outra conta pela interface). Em computador compartilhado, a lista de convidados fica legível localmente. Decidir na fase 5 se sair deve limpar rascunhos sem pendências.
- `drizzle/0001_remove_receipt_date_index.sql` estava vazio, embora a baseline 0000 crie `project_write_receipts_created_idx` e o schema Drizzle não o tenha mais. Bancos novos ficariam com um índice fora do schema. Corrigido com `DROP INDEX IF EXISTS`; `drizzle-kit generate` não aponta divergência. Bancos locais que já registraram a 0001 vazia podem executar o mesmo comando manualmente.
- Teclado, leitores de tela e celular nas telas `/conta` e `/projetos` não foram auditados (painel do navegador oculto nesta sessão; verificação por DOM).

## Retorno à página inicial e navegação da conta

Em 21/11/2026, o navegador do Orca acessou a web pelo proxy local com a API real e PostgreSQL 18 descartável, usando contas fictícias.

- O cadastro por e-mail abriu a lista vazia. O logotipo levou à página inicial com “Minha conta” e “Abrir meus projetos”. A recarga manteve os dois links. A saída em outra aba atualizou a raiz aberta para “Entrar”. Com a API interrompida, a raiz exibiu “Conta” e manteve o editor local acessível.
- A criação abriu o editor com o identificador do projeto. Voltar trouxe o projeto para a lista. A renomeação atualizou o título, o painel de compartilhamento abriu, e a busca por “cerimonia” encontrou “Cerimônia no jardim” entre dois projetos.
- Em Minha conta, uma conta com senha mostrou o perfil, a opção de conectar o Google e o gerenciamento da conta. As capturas de conta e projetos em 1280 × 900 e 390 × 844 foram revisadas. A largura de conteúdo nas duas telas móveis foi de 390 px.
- Node 24.22.1 e pnpm 12.18.0. Check e lint passaram. A suíte passou com 196 testes, incluindo os de PostgreSQL. O build de preview no Windows passou. JavaScript inicial da raiz em produção local: 43,52 KiB gzip para o orçamento de 150 KiB. Prettier passou nos arquivos alterados e, com finais de linha automáticos, no repositório. O comando padrão no checkout Windows acusa diferenças de LF/CRLF.

O retorno OAuth real, o pacote Vercel em Linux, o leitor de tela e o celular físico não foram exercitados nesta revisão.
