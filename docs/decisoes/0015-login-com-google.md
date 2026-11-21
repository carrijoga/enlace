# ADR-0015 — Login com Google e exclusão de contas sem senha

Status: aceita em 21/11/2026, pedido do usuário. Implementada localmente. Falta o aceite hospedado, que depende do cliente OAuth no Google Cloud.

## Contexto

`/conta` tinha um único formulário de e-mail e senha para entrar e para criar conta. O usuário pediu duas coisas: dar destaque ao login e ao cadastro com o Google, deixando o e-mail como segunda opção, e permitir que a pessoa exclua a própria conta e os dados dela. A exclusão já existia desde a fase 5 (ADR-0009), mas exigia senha, e uma conta criada pelo Google não tem senha.

## Decisão

1. **Provedor social do Better Auth.** Usamos o `socialProviders.google` da biblioteca que já cuida das contas, sem dependência nova. As variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` são opcionais: ou as duas existem, ou nenhuma. `GET /api/auth-capabilities` passa a informar `google`. Sem as variáveis, a tela mostra só o e-mail.
2. **O fluxo passa pelo proxy same-origin.** O endereço de retorno é `${WEB_ORIGIN}/api/auth/callback/google`, então o cookie de sessão continua sendo da origem da Vercel (ADR-0003). Erros de OAuth voltam para `/conta?error=…` (`onAPIError.errorURL`), e não para a página de erro da API. A janela do Google usa `prompt: 'select_account'`.
3. **Sem vinculação implícita com contas de senha.** Uma conta por senha não tem e-mail verificado. Se o Google entrasse direto nela, alguém poderia cadastrar o e-mail de outra pessoa com uma senha própria e continuar com acesso depois que a dona entrasse pelo Google (sequestro pré-cadastro). Por isso fica o padrão do Better Auth 1.7 (`requireLocalEmailVerified: true`), sem `trustedProviders` e sem e-mails diferentes. O Google devolve `account_not_linked`, e a tela orienta a pessoa a entrar com a senha e conectar o Google em Conta (`link-social`, com sessão e mesmo e-mail).
4. **Exclusão sem senha só com login recente.** Quem tem senha continua digitando a senha. Uma conta só Google pode excluir sem senha se a sessão tiver sido criada nos últimos 10 minutos. Se for mais antiga, a API responde `REAUTH_REQUIRED`, a tela pede para confirmar com o Google (o que cria uma sessão nova) e volta para a zona de exclusão. A exclusão nunca acontece automaticamente: a pessoa ainda digita o e-mail e confirma. Os dados caem em cascata no banco, como antes: projetos, convidados, links, sessões e o vínculo com o Google.

## Consequências

- O Railway precisa declarar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` com `preserve()` em `.railway/railway.ts`, porque o `apply` apaga variáveis que não estão declaradas.
- Para ativar o Google em produção, o usuário cria um cliente OAuth "Aplicativo da Web" no Google Cloud, com a origem `https://enlace.carrijoga.com.br` e o redirecionamento `https://enlace.carrijoga.com.br/api/auth/callback/google`, e grava as duas variáveis no serviço `api`. A tela de consentimento precisa de nome do app, e-mail de suporte e links de privacidade e termos para sair do modo de teste.
- Os tokens do Google ficam na tabela `account` e são apagados com a conta. O Enlace não usa nenhuma API do Google além do login.
- Não verificado: o fluxo OAuth real (só existe com credenciais), cookies em HTTPS pela Vercel e a revogação do acesso do lado do Google ao excluir a conta (não é feita; a pessoa remove o Enlace em myaccount.google.com, se quiser).
