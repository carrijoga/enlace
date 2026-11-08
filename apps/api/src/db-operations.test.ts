import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresEnvironment, runBackup } from '../../../scripts/db-backup.mjs';
import { validateRestoreTarget } from '../../../scripts/db-restore-drill.mjs';

describe('scripts de operação PostgreSQL', () => {
  it('converte URL em variáveis libpq sem colocar segredo nos argumentos', () => {
    const env = postgresEnvironment(
      'postgresql://user%40db:p%40ss@localhost:5433/enlace?sslmode=require',
    );
    expect(env).toMatchObject({
      PGHOST: 'localhost',
      PGPORT: '5433',
      PGUSER: 'user@db',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'enlace',
      PGSSLMODE: 'require',
    });
  });

  it('recusa destino não descartável, confirmação diferente e origem igual', () => {
    const safe = {
      RESTORE_DATABASE_URL: 'postgresql://localhost/enlace_disposable_drill',
      RESTORE_FILE: 'backup.dump',
      RESTORE_CONFIRM_TARGET: 'enlace_disposable_drill',
    };
    expect(validateRestoreTarget(safe).targetName).toBe('enlace_disposable_drill');
    expect(() => validateRestoreTarget({ ...safe, RESTORE_CONFIRM_TARGET: 'wrong' })).toThrow(
      'Confirme o destino',
    );
    expect(() =>
      validateRestoreTarget({
        ...safe,
        RESTORE_DATABASE_URL: 'postgresql://localhost/enlace',
        RESTORE_CONFIRM_TARGET: 'enlace',
      }),
    ).toThrow('enlace_disposable_');
    expect(() =>
      validateRestoreTarget({
        ...safe,
        BACKUP_DATABASE_URL: safe.RESTORE_DATABASE_URL,
      }),
    ).toThrow('origem');
  });

  it('recusa esquemas que não são PostgreSQL', () => {
    expect(() => postgresEnvironment('https://example.test/database')).toThrow('PostgreSQL');
  });

  it('preserva backup existente e remove apenas arquivo parcial que criou', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'enlace-backup-'));
    const existingFile = join(directory, 'existing.dump');
    const partialFile = join(directory, 'partial.dump');
    await writeFile(existingFile, 'backup-preservado');
    try {
      await expect(
        runBackup({
          BACKUP_DATABASE_URL: 'postgresql://localhost/enlace',
          BACKUP_FILE: existingFile,
        }),
      ).rejects.toThrow('nenhum arquivo foi alterado');
      await expect(readFile(existingFile, 'utf8')).resolves.toBe('backup-preservado');

      await expect(
        runBackup({
          BACKUP_DATABASE_URL: 'postgresql://localhost/enlace',
          BACKUP_FILE: partialFile,
          PATH: '',
        }),
      ).rejects.toThrow('Backup falhou');
      await expect(readFile(partialFile)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
