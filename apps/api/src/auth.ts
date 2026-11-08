import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './auth-schema.js';
import type { ApiConfig } from './config.js';
import { createMailSender } from './mail.js';

export function createAuth(pool: Pool, config: ApiConfig, mailSender = createMailSender(config)) {
  if (!config.authSecret) return undefined;
  const db = drizzle(pool, { schema });
  const sendResetPassword = mailSender;
  return betterAuth({
    appName: 'Enlace',
    baseURL: `${config.webOrigin}/api/auth`,
    secret: config.authSecret,
    trustedOrigins: [config.webOrigin],
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
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 30 },
        '/sign-up/email': { window: 60, max: 30 },
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
  });
}
