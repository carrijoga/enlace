export interface ApiConfig {
  port: number;
  webOrigin: string;
  databaseUrl?: string;
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
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535');
  }
  return {
    port,
    webOrigin: parsedOrigin.origin,
    ...(env.DATABASE_URL ? { databaseUrl: env.DATABASE_URL } : {}),
    version: env.npm_package_version ?? '0.1.0',
    production,
  };
}
