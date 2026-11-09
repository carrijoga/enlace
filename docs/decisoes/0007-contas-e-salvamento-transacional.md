# ADR-0007 — Contas e salvamento transacional

Data: 08/11/2026. Status: aceita para implementação local da fase 3; aceite remoto depende das validações de hospedagem e e-mail.

## Contexto

A fase 2 está concluída. O editor local deve continuar utilizável, enquanto contas permitem retomar projetos em outros dispositivos. A arquitetura Vercel → API Hono Railway → PostgreSQL privado permanece conforme ADR-0003.

## Decisão

- Better Auth na API, com e-mail/senha, sessões persistidas e IDs de usuário textuais definidos pela biblioteca. Não implementar criptografia de senha ou tokens próprios.
- O navegador chama `/api/auth/*` e `/api/projects` na origem do frontend. O proxy tem destino fixo, limite de corpo, cabeçalhos permitidos explícitos, nenhuma cache e preserva cookies de sessão. Não confia em cabeçalhos de identidade ou encaminhamento enviados pelo cliente. Mutações exigem `Origin` válida também na API.
- Planta JSONB, convidados e atribuições relacionais. Toda operação usa a identidade da sessão; consultas restringem proprietário e projeto. A leitura é consistente, a escrita usa transação com bloqueio do projeto e revisão esperada. Referências e unicidade são verificadas também no banco.
- Criação usa UUID de projeto e operação gerados no cliente. Salvamento usa `expectedRevision`, `operationId` e agregado completo. Recibos associam hash e revisão à operação: repetir a mesma requisição não repete a alteração; reutilizar operação com outro corpo é erro.
- A confirmação de salvamento retorna somente ID, revisão e data, evitando que um recibo antigo seja apresentado como snapshot atual. Conflitos preservam o rascunho e exigem escolha explícita de recarregar ou criar outro projeto.
- Uma gravação em voo por editor. Edições posteriores continuam pendentes até sua confirmação. Recuperação local é isolada por conta/projeto; o rascunho anônimo permanece separado.
- SMTP é configurável no servidor. Sem transporte, recuperação de senha aparece indisponível; não imprimir links/tokens em logs e não declarar envio funcional. A escolha de provedor e a validação no ambiente hospedado permanecem pendentes.
- Migrações versionadas usam credencial própria. Runtime de produção não recebe DDL/superuser. Nenhum deploy ou recurso pago faz parte desta implementação.

## Consequências e validação

Testar duas contas com chamadas diretas, sessões expiradas, concorrência, repetição após confirmação perdida, rollback e exclusão com dependências. Testes PostgreSQL devem usar banco/schema isolado e dados fictícios. O teste local não substitui cookies/origem na Vercel/Railway ou recebimento de e-mail real. CSV continua na fase 4.

Referências: [Better Auth com Hono](https://better-auth.com/docs/integrations/hono), [adaptador Drizzle](https://better-auth.com/docs/adapters/drizzle), [e-mail e senha](https://better-auth.com/docs/authentication/email-password).
