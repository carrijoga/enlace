import { database, defineRailway, github, preserve, project, service } from 'railway/iac';

// Railway não lê este arquivo no deploy: mudanças valem após `railway config plan` e `railway config apply`.
// Valores secretos ficam na Railway (`preserve()`), nunca neste repositório. Ver docs/desenvolvimento.md.
export default defineRailway(() => {
  // Mesma versão maior do Compose, da CI e dos utilitários de backup. O volume de produção foi
  // inicializado em 18 (padrão do SDK); voltar a 17 trava o banco, ver ADR-0013.
  const db = database('postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:18',
    output: 'DATABASE_URL',
    defaultMountPath: '/var/lib/postgresql/data',
    region: 'us-east4-eqdc4a',
  });

  const api = service('api', {
    source: github('carrijoga/enlace', { branch: 'main' }),
    build: 'pnpm run build:api',
    preDeploy: 'node apps/api/dist/db/migrate.js',
    start: 'node apps/api/dist/server.js',
    healthcheck: '/health',
    healthcheckTimeout: 30,
    replicas: { 'us-east4-eqdc4a': 1 },
    env: {
      NODE_ENV: 'production',
      // Explícita: sem ela a Railway injetou 5432 e o domínio gerado respondeu 502.
      PORT: '3000',
      PG_MIGRATOR_ROLE: 'enlace_migrator',
      WEB_ORIGIN: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      // Gravado na Railway para os links de visualização (ADR-0014). Declarado para o apply não apagá-lo.
      SHARE_LINK_SECRET: preserve(),
      // Login com Google (opcional, as duas juntas). Declaradas para o apply não apagá-las.
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      DATABASE_URL: preserve(),
      MIGRATOR_DATABASE_URL: preserve(),
    },
  });

  return project('enlace', { resources: [api, db] });
});
