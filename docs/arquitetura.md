# Arquitetura

Atualizado em 08/11/2026. Fases 1–4 implementadas localmente; fase 5 prepara o aceite hospedado. Frontend Vercel, API Hono/Node e PostgreSQL privado Railway conforme [ADR-0003](decisoes/0003-frontend-vercel-api-railway.md). Contas e persistência seguem o [ADR-0007](decisoes/0007-contas-e-salvamento-transacional.md). Nenhum deploy ou provisionamento remoto faz parte desta entrega.

## Fronteiras

| Parte | Responsabilidade |
| --- | --- |
| `apps/web` — SvelteKit/Svelte/TypeScript | Landing `/`, editor `/editor`, conta `/conta`, lista `/projetos`; proxy same-origin com destino fixo. |
| `apps/api` — Hono/Node | Better Auth, validação de sessão e proprietário, operações de projeto, health/readiness. |
| PostgreSQL / Drizzle / `pg` | Identidade e sessões, planta JSONB, convidados, atribuições e recibos; transações e integridade. |
| `packages/contracts` | Schemas Zod portáteis e de transporte, parser/migração JSON v3. Compilar antes dos consumidores. |
| `packages/domain` | Geometria e comandos puros imutáveis; não acessa rede, DOM ou banco. |

A infraestrutura escolhida permanece Vercel → Railway API → PostgreSQL privado. Supabase foi descartado. A web não recebe credenciais de banco; a API usa pool limitado por processo. Não há estado de usuário compartilhado em variáveis globais do servidor.

## Editor e experiência

O modo anônimo continua funcionando sem conta ou API. Snapshot imutável, histórico de 35 entradas, seleção/zoom/filtros fora do agregado, JSON/PNG sob demanda e atualização local imediata preservam a fase 2. O rascunho anônimo pertence à origem do navegador. O editor remoto é aberto pela lista de projetos e mantém recuperação separada por conta e projeto.

Selecionar ou mover pessoas não espera rede. Salvamento usa revisão esperada e uma requisição por vez. Uma confirmação antiga não confirma edições posteriores. Em falha ambígua, a mesma operação e corpo podem ser repetidos; em conflito, o usuário escolhe recarregar a versão remota ou salvar uma cópia. “Salvo na nuvem” depende de confirmação da API. O JSON portátil permanece disponível para recuperação e não contém sessões ou propriedade.

## Autenticação e transporte

Better Auth executa na API com adaptador Drizzle e IDs textuais de usuário. E-mail/senha, sessões persistidas, logout e recuperação via transporte SMTP configurável. Sem SMTP, recuperação é explicitamente indisponível; não se registram links ou tokens nos logs. Verificação de e-mail não é obrigatória nesta implementação; recebimento de e-mail e políticas de entrega ainda precisam de validação no ambiente de publicação.

O navegador chama `/api/auth/*`, `/api/auth-capabilities` e `/api/projects` na origem do frontend. O proxy encaminha somente cabeçalhos permitidos ao destino configurado em `API_ORIGIN`; preserva múltiplos `Set-Cookie`, limita corpo a 2 MiB, recusa destino arbitrário e não armazena respostas privadas em cache. Cookies são HttpOnly, SameSite=Lax e Secure em produção. O `baseURL` público da autenticação deriva de `WEB_ORIGIN`, sem confiar em host encaminhado pelo cliente.

As escritas conferem origem no proxy e no backend. CORS não substitui sessão/CSRF. Cada chamada de projeto obtém a sessão no servidor sem cache de cookie de identidade, e usa o proprietário da sessão nas consultas. Uma conta diferente recebe 404 para o ID alheio. `ownerId` vindo do corpo é recusado pelos contratos estritos.

O controle de frequência da autenticação é persistido no PostgreSQL. Como não há cadeia de proxies/IP confiável configurada, cabeçalhos IP do cliente são ignorados; os contadores são compartilhados por endpoint. Esse limite protege de rajadas, mas não substitui proteção individual contra abuso. Configurar uma cadeia confiável e validar limites/fairness antes de exposição pública.

## Agregado, transações e conflitos

Metadados e planta ficam em `projects`; convidados em `guests`; lugares em `seat_assignments`. Não há cópia concorrente do agregado inteiro no banco. A leitura usa snapshot consistente. Escritas bloqueiam a linha do projeto e comparam a revisão na mesma conexão/transação antes de substituir o agregado, incrementar uma vez e gravar recibo.

O recibo associa projeto, ator e operação ao hash da requisição e revisão resultante. Uma repetição idêntica retorna a confirmação original; reutilização com corpo diferente é conflito. Criação usa UUID de projeto fornecido pelo cliente e não sobrescreve identidade já existente. Exclusão confere proprietário e revisão e remove dependências. Detalhes em [modelo de dados](modelo-de-dados.md) e [contratos](contratos.md).

## Migrações e operação

A fase 5 acrescenta exclusão de conta pelo Better Auth com senha obrigatória em hook no servidor e cascata das dependências no PostgreSQL. A interface exige confirmação pelo e-mail, sem usar esse campo para escolher o proprietário. Logs HTTP contêm apenas método, template de rota, status e duração; analytics elimina parâmetros e ignora conta/projetos. Backup lógico e ensaio de restauração isolada estão descritos em [operação](operacao.md). Decisões em [ADR-0009](decisoes/0009-preparacao-da-primeira-versao.md).

Migrações SQL versionadas acompanham o schema Drizzle. São executadas explicitamente, com credencial de migração, fora do build e das requisições. Runtime em produção deve ser role sem DDL/superuser; o banco não é exposto ao navegador. O runner serializa aplicações e registra migrações aplicadas. Testes usam schemas isolados e dados fictícios.

`/health` verifica processo; `/ready` verifica conectividade, não todos os fluxos de negócio. Configuração e comandos em [desenvolvimento](desenvolvimento.md). Dockerfile/Compose paralelos do usuário não foram incorporados à configuração Railway. O build Windows é preview; o pacote Vercel completo continua sendo `build:vercel` em Linux/CI.

## Validação e próximos limites

A aceitação da fase 3 exige testes de duas contas, transações, conflito simultâneo, repetição, sessão expirada, falha de rede e recuperação local. Evidências em [validação fase 3](validacao-fase3.md). Teste local não comprova cookies/origem na hospedagem Vercel/Railway. SMTP real, backup/restauração, domínio, região, recursos, orçamento e publicação precisam de configuração e verificação próprias.

CSV pertence à fase 4. Colaboração entre contas, cenários alternativos, objetos livres, links públicos e edição simultânea em tempo real permanecem fora do primeiro recorte. Metas de leveza e medição permanecem em [desempenho](desempenho.md); nenhuma biblioteca de estado ou UI foi adicionada para contas.
