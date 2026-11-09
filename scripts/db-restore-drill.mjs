import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresEnvironment } from './db-backup.mjs';

function databaseName(connectionString) {
  const url = new URL(connectionString);
  return decodeURIComponent(url.pathname.slice(1));
}

export function validateRestoreTarget(env) {
  const connectionString = env.RESTORE_DATABASE_URL;
  if (!connectionString || !env.RESTORE_FILE) {
    throw new Error('Defina RESTORE_DATABASE_URL e RESTORE_FILE');
  }
  const targetName = databaseName(connectionString);
  if (!/^enlace_disposable_[a-z0-9_]+$/i.test(targetName)) {
    throw new Error('O banco de destino precisa começar com enlace_disposable_');
  }
  if (env.RESTORE_CONFIRM_TARGET !== targetName) {
    throw new Error(
      'Confirme o destino definindo RESTORE_CONFIRM_TARGET com o nome exato do banco',
    );
  }
  if (env.BACKUP_DATABASE_URL && databaseName(env.BACKUP_DATABASE_URL) === targetName) {
    throw new Error('O destino não pode ser o banco de origem');
  }
  return { connectionString, archive: env.RESTORE_FILE, targetName };
}

async function restoreDrill() {
  const { connectionString, archive, targetName } = validateRestoreTarget(process.env);

  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      'pg_restore',
      [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        `--dbname=${targetName}`,
        resolve(archive),
      ],
      { env: postgresEnvironment(connectionString), stdio: 'ignore', windowsHide: true },
    );
    child.once('error', () =>
      reject(new Error('Restauração falhou; confira pg_restore e a conexão')),
    );
    child.once('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error('Restauração falhou; confira arquivo, permissões e conexão')),
    );
  });
  return `Restauração concluída no banco descartável ${targetName}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await restoreDrill());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Restauração falhou');
    process.exitCode = 1;
  }
}
