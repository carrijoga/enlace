# Operação da API e PostgreSQL

Atualizado em 08/11/2026. Procedimento local e pré-deploy; não representa backup ou recuperação já configurados na hospedagem.

## Migrações antes do deploy

Migrações são um passo operacional separado do build e do start da API. Faça o deploy da versão de código compatível e, antes de direcionar tráfego para ela:

1. Revise os arquivos novos em `apps/api/drizzle/` e confirme que há backup recente e recuperável do banco de destino.
2. Disponibilize `DATABASE_URL` somente no ambiente de execução do comando e `PG_MIGRATOR_ROLE` quando aplicável. Use a credencial de migração, nunca a role runtime.
3. Rode `pnpm run db:check` e depois `pnpm run db:migrate` uma vez para o ambiente. O advisory lock serializa concorrência; o runner aplica arquivos versionados em ordem e registra cada commit.
4. Inicie/atualize a API e confira `/health` e `/ready`. `/ready` comprova apenas conectividade ao PostgreSQL, não o funcionamento de login ou escrita de projeto.
5. Observe os eventos de requisição e os erros agregados do provedor. Não rode `drizzle-kit push` em hospedagem.

Na Railway, o pré-deploy de `.railway/railway.ts` executa o runner compilado com `MIGRATOR_DATABASE_URL` e bloqueia o deploy se falhar; o backup prévio continua sendo responsabilidade do operador.

Comandos na raiz: `db:backup`, `db:restore:drill` (somente destino descartável) e `db:predeploy` como atalho para `db:check` seguido de `db:migrate`.

## Backup lógico e ensaio de restauração

Instale `pg_dump` e `pg_restore` compatíveis com PostgreSQL 17 no `PATH`. O backup custom inclui tabelas e dados da aplicação e autenticação; portanto, contém dados pessoais e deve ser armazenado com acesso restrito e retenção definida pelo operador. Os scripts não imprimem URL, senha, argumentos de conexão ou saída bruta dos utilitários.

Backup não sobrescreve um arquivo existente:

```powershell
$env:BACKUP_DATABASE_URL = 'postgresql://…'
$env:BACKUP_FILE = 'C:\backups\enlace-2026-11-08.dump'
node scripts/db-backup.mjs
```

Restauração destrói e recria objetos dentro do banco indicado pelo URL. Para reduzir enganos, o script aceita somente nomes começados por `enlace_disposable_`, exige confirmação exata e recusa o banco configurado como origem em `BACKUP_DATABASE_URL`:

```powershell
$env:RESTORE_DATABASE_URL = 'postgresql://…/enlace_disposable_drill'
$env:RESTORE_FILE = 'C:\backups\enlace-2026-11-08.dump'
$env:RESTORE_CONFIRM_TARGET = 'enlace_disposable_drill'
node scripts/db-restore-drill.mjs
```

Crie esse banco isolado explicitamente antes do ensaio. Não use o banco normal de desenvolvimento como destino. Para o critério de dados fictícios, insira apenas um projeto, convidados e atribuições sintéticos antes de gerar o dump; restaure em outro banco descartável, aplique `db:check`/`db:migrate` conforme necessário e confira o agregado via API ou uma consulta de leitura sem copiar dados reais. Registre data, revisão do dump, tamanho e resultado do ensaio sem registrar nomes, e-mails, URLs ou conteúdo do projeto. Repita periodicamente e após mudanças de schema. Este fluxo é backup lógico manual: não configura agenda, criptografia em repouso, retenção, cópia externa ou recuperação point-in-time.

## Logs e sinais operacionais

A API emite JSON por requisição com `event`, método, template da rota, status e duração em milissegundos. O middleware não inclui URL completa, query string, identificadores de projeto, cabeçalhos, corpo, sessão nem endereço IP. Evite adicionar esses campos; a API trata dados de convidados e credenciais como privados. A resposta de erro continua genérica, sem stack trace ou mensagem do banco.

`/health` verifica o processo; `/ready` executa uma consulta simples ao banco e retorna apenas `ready` ou `not_ready`. Configure o monitor externo para esses sinais sem enviar payload de produto. Logs de plataforma podem acrescentar metadados de transporte; retenção, acesso e alertas precisam ser configurados no provedor antes de uso real. Eventos HTTP não substituem métricas de pool, latência de banco, erros de SMTP nem alertas de backup.

O Web Analytics passa por `beforeSend`: remove query string e fragmentos antes de emitir page views e descarta as rotas `/conta` e `/projetos`, que podem conter estado de autenticação ou parâmetros ligados a dados pessoais. A rota do editor permanece agregada sem query/hash, então o UUID de projeto não é enviado. Confirme no painel do provedor após publicação que a integração recebe somente a rota saneada; esse comportamento não foi validado contra um endpoint hospedado.

## Limites atuais

- Backup/restore precisam de ferramentas PostgreSQL locais e conectividade fornecida pelo operador.
- O prefixo descartável e a confirmação reduzem risco; não substituem a conferência do destino e não impedem alguém com credencial ampla de escolher outro banco no servidor.
- O teste dos scripts não comprova restore real até ser executado contra PostgreSQL isolado com dados fictícios.
- Railway, retenção, criptografia, permissões efetivas de migração/runtime, cookies HTTPS e política de recuperação permanecem por validar em ambiente de teste.
