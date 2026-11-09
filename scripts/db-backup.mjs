import { open, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export function postgresEnvironment(connectionString, baseEnv = process.env) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL deve usar PostgreSQL');
  }
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) if (/^PG[A-Z0-9_]+$/.test(key)) delete env[key];
  env.PGHOST = decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ''));
  env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

export async function runBackup(env = process.env) {
  const connectionString = env.BACKUP_DATABASE_URL;
  const outputPath = env.BACKUP_FILE;
  if (!connectionString || !outputPath) {
    throw new Error('Defina BACKUP_DATABASE_URL e BACKUP_FILE');
  }
  const connectionEnv = postgresEnvironment(connectionString, env);
  const absolutePath = resolve(outputPath);
  let fileHandle;
  try {
    // Reserve a new file before starting pg_dump; a preexisting backup is never touched.
    fileHandle = await open(absolutePath, 'wx', 0o600);
  } catch {
    throw new Error(
      'Não foi possível reservar um arquivo novo para o backup; nenhum arquivo foi alterado',
    );
  }

  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges'], {
    env: connectionEnv,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const output = fileHandle.createWriteStream();
  const streamDone = pipeline(child.stdout, output);
  void streamDone.catch(() => child.kill());
  const processDone = new Promise((resolvePromise, reject) => {
    child.once('error', () => reject(new Error('Não foi possível iniciar pg_dump')));
    child.once('close', (code) =>
      code === 0 ? resolvePromise(undefined) : reject(new Error('pg_dump terminou com erro')),
    );
  });

  const results = await Promise.allSettled([streamDone, processDone]);
  if (results.every((result) => result.status === 'fulfilled')) {
    return `Backup criado: ${absolutePath}`;
  }
  child.kill();
  output.destroy();
  await rm(absolutePath, { force: true });
  throw new Error('Backup falhou; confira pg_dump e a conexão sem compartilhar credenciais');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await runBackup());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup falhou');
    process.exitCode = 1;
  }
}
