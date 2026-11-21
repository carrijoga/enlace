import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './auth-schema.js';
import type { ApiConfig } from './config.js';
import { createMailSender } from './mail.js';

// Excluir conta sem senha (só Google) exige login recente: a sessão tem de ter no máximo 10 minutos.
export const REAUTH_WINDOW_SECONDS = 600;

export function createAuth(pool: Pool, config: ApiConfig, mailSender = createMailSender(config)) {
  if (!config.authSecret) return undefined;
  const db = drizzle(pool, { schema });
  const sendResetPassword = mailSender;
  return betterAuth({
    appName: 'Enlace',
    baseURL: `${config.webOrigin}/api/auth`,
    secret: config.authSecret,
    trustedOrigins: [config.webOrigin],
    // Erros de OAuth (ex.: account_not_linked) voltam para a página de conta, com ?error=.
    onAPIError: { errorURL: `${config.webOrigin}/conta` },
    logger: { disabled: true },
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword
        ? {
            sendResetPassword: async ({
              user: authUser,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => sendResetPassword(authUser.email, url),
          }
        : {
            sendResetPassword: async () => {
              throw new Error('password_reset_unavailable');
            },
          }),
    },
    ...(config.googleClientId && config.googleClientSecret
      ? {
          socialProviders: {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
              prompt: 'select_account' as const,
            },
          },
        }
      : {}),
    account: {
      // Contas por senha não têm e-mail verificado: entrar com Google no mesmo e-mail NÃO vincula
      // sozinho (evita sequestro por pré-cadastro; resulta em account_not_linked). Vincular só
      // explicitamente, logado, via link-social. Ali a pessoa já provou ser a dona da conta, então
      // a conta Google pode ter outro e-mail (ADR-0015). `allowDifferentEmails` só vale para a
      // vinculação explícita; o e-mail da conta não muda (`updateUserInfoOnLink` fica desligado).
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: true,
        allowDifferentEmails: true,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 30 },
        '/sign-up/email': { window: 60, max: 30 },
        '/sign-in/social': { window: 60, max: 30 },
        '/request-password-reset': { window: 60, max: 30 },
      },
    },
    advanced: {
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.production,
      },
      trustedProxyHeaders: false,
      ipAddress: { ipAddressHeaders: [] },
    },
    session: { cookieCache: { enabled: false } },
    user: {
      deleteUser: { enabled: true },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/delete-user') return;
        // Sem sessão, o próprio endpoint responde 401.
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);
        const hasPassword = accounts.some((item) => item.providerId === 'credential');
        if (hasPassword) {
          if (
            !ctx.body ||
            typeof ctx.body.password !== 'string' ||
            ctx.body.password.length === 0
          ) {
            throw APIError.from('BAD_REQUEST', {
              code: 'PASSWORD_REQUIRED',
              message: 'Password is required to delete the account',
            });
          }
          return;
        }
        // Conta só Google: sem senha para confirmar, exige login recente.
        const ageMs = Date.now() - new Date(session.session.createdAt).getTime();
        if (ageMs > REAUTH_WINDOW_SECONDS * 1000) {
          throw APIError.from('BAD_REQUEST', {
            code: 'REAUTH_REQUIRED',
            message: 'Recent sign-in is required to delete the account',
          });
        }
      }),
    },
  });
}
