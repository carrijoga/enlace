import { database, defineRailway, github, preserve, project, service } from 'railway/iac';

// Railway não lê este arquivo no deploy: mudanças valem após `railway config plan` e `railway config apply`.
// Valores secretos ficam na Railway (`preserve()`), nunca neste repositório. Ver docs/desenvolvimento.md.
export default defineRailway(() => {
  // Mesma versão maior do Compose, da CI e dos utilitários de backup (o padrão do SDK é 18).
  const db = database('postgres', 'postgres', {
    image: 'ghcr.io/railwayapp-templates/postgres-ssl:17',
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
      PG_MIGRATOR_ROLE: 'enlace_migrator',
      WEB_ORIGIN: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
      MIGRATOR_DATABASE_URL: preserve(),
    },
  });

  return project('enlace', { resources: [api, db] });
});
