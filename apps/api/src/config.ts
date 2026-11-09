export interface ApiConfig {
  port: number;
  webOrigin: string;
  databaseUrl?: string;
  authSecret?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  version: string;
  production: boolean;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production';
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:5173';
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    throw new Error('WEB_ORIGIN deve ser uma origem HTTP(S) válida');
  }
  if (parsedOrigin.origin !== webOrigin || !['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new Error('WEB_ORIGIN deve conter somente uma origem HTTP(S)');
  }
  if (production && parsedOrigin.protocol !== 'https:') {
    throw new Error('WEB_ORIGIN deve usar HTTPS em produção');
  }
  if (production && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatória em produção');
  }
  const authSecret = env.BETTER_AUTH_SECRET;
  if (production && (!authSecret || authSecret.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET deve ter ao menos 32 caracteres em produção');
  }
  if (authSecret && authSecret.length < 32)
    throw new Error('BETTER_AUTH_SECRET deve ter ao menos 32 caracteres');
  const smtpPort = env.SMTP_PORT === undefined ? undefined : Number(env.SMTP_PORT);
  if (smtpPort !== undefined && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new Error('SMTP_PORT inválida');
  }
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535');
  }
  return {
    port,
    webOrigin: parsedOrigin.origin,
    ...(env.DATABASE_URL ? { databaseUrl: env.DATABASE_URL } : {}),
    ...(authSecret ? { authSecret } : {}),
    ...(env.SMTP_HOST ? { smtpHost: env.SMTP_HOST } : {}),
    ...(smtpPort ? { smtpPort } : {}),
    ...(env.SMTP_USER ? { smtpUser: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { smtpPassword: env.SMTP_PASSWORD } : {}),
    ...(env.SMTP_FROM ? { smtpFrom: env.SMTP_FROM } : {}),
    version: env.npm_package_version ?? '0.1.0',
    production,
  };
}
