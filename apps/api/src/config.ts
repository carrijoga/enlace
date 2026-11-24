export interface ApiConfig {
  port: number;
  webOrigin: string;
  databaseUrl?: string;
  authSecret?: string;
  shareLinkSecret?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  googleClientId?: string;
  googleClientSecret?: string;
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
  // ADR-0014: assina os links de visualização. Separado do segredo de sessão, para que trocar um
  // não invalide o outro; trocá-lo desativa todos os links de uma vez.
  const shareLinkSecret = env.SHARE_LINK_SECRET;
  if (production && !shareLinkSecret)
    throw new Error('SHARE_LINK_SECRET é obrigatória em produção');
  if (shareLinkSecret && shareLinkSecret.length < 32)
    throw new Error('SHARE_LINK_SECRET deve ter ao menos 32 caracteres');
  if (shareLinkSecret && shareLinkSecret === authSecret)
    throw new Error('SHARE_LINK_SECRET deve ser diferente de BETTER_AUTH_SECRET');
  const smtpPort = env.SMTP_PORT === undefined ? undefined : Number(env.SMTP_PORT);
  if (smtpPort !== undefined && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new Error('SMTP_PORT inválida');
  }
  // Login com Google é opcional, mas as duas credenciais andam juntas: uma só é erro de configuração.
  const googleClientId = env.GOOGLE_CLIENT_ID || undefined;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET || undefined;
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem ser definidos juntos');
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
    ...(shareLinkSecret ? { shareLinkSecret } : {}),
    ...(env.SMTP_HOST ? { smtpHost: env.SMTP_HOST } : {}),
    ...(smtpPort ? { smtpPort } : {}),
    ...(env.SMTP_USER ? { smtpUser: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { smtpPassword: env.SMTP_PASSWORD } : {}),
    ...(env.SMTP_FROM ? { smtpFrom: env.SMTP_FROM } : {}),
    ...(googleClientId && googleClientSecret ? { googleClientId, googleClientSecret } : {}),
    version: env.npm_package_version ?? '0.1.0',
    production,
  };
}
