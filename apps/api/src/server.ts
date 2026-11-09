import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { checkDatabase, closeDatabase } from './database.js';
import { getAuth, getPool } from './database.js';
import { createProjectStore } from './projects/store.js';

const config = readConfig();
const app = createApp(config, {
  checkReadiness: () => checkDatabase(config.databaseUrl),
  auth: getAuth(config),
  ...(config.databaseUrl ? { projectStore: createProjectStore(getPool(config.databaseUrl)) } : {}),
});
const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`enlace-api escutando na porta ${info.port}`);
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`Encerrando após ${signal}`);
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
