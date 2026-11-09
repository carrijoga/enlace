import { randomBytes } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const LOGINS = {
  app: { name: 'enlace_app', group: 'enlace_runtime' },
  deploy: { name: 'enlace_deploy', group: 'enlace_migrator' },
};

async function upsertLogin(client, { name, group }, password) {
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
  const verb = exists.rowCount ? 'ALTER' : 'CREATE';
  // Nomes são constantes e a senha é hexadecimal gerada aqui; PostgreSQL não parametriza DDL.
  await client.query(
    `${verb} ROLE "${name}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  await client.query(`GRANT "${group}" TO "${name}"`);
}

export function variableLines(passwords, postgresService = 'postgres') {
  const host = `\${{${postgresService}.RAILWAY_PRIVATE_DOMAIN}}`;
  const database = `\${{${postgresService}.PGDATABASE}}`;
  const url = (login, password) => `postgresql://${login}:${password}@${host}:5432/${database}`;
  return [
    `DATABASE_URL=${url(LOGINS.app.name, passwords.app)}`,
    `MIGRATOR_DATABASE_URL=${url(LOGINS.deploy.name, passwords.deploy)}`,
  ];
}

/** Cria roles e logins restritos; grava as variáveis em arquivo novo, sem imprimir credenciais. */
export async function bootstrapRoles(env = process.env) {
  const connectionString = env.BOOTSTRAP_DATABASE_URL ?? env.DATABASE_PUBLIC_URL;
  const outputPath = env.BOOTSTRAP_OUTPUT_FILE;
  if (!connectionString || !outputPath) {
    throw new Error(
      'Defina BOOTSTRAP_DATABASE_URL (ou DATABASE_PUBLIC_URL) e BOOTSTRAP_OUTPUT_FILE',
    );
  }
  const absolutePath = resolve(outputPath);
  let fileHandle;
  try {
    fileHandle = await open(absolutePath, 'wx', 0o600);
  } catch {
    throw new Error('Não foi possível reservar um arquivo novo; nenhuma role foi alterada');
  }
  const rolesFile = fileURLToPath(new URL('../apps/api/drizzle/roles.sql', import.meta.url));
  const passwords = {
    app: randomBytes(32).toString('hex'),
    deploy: randomBytes(32).toString('hex'),
  };
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(await readFile(rolesFile, 'utf8'));
    await upsertLogin(client, LOGINS.app, passwords.app);
    await upsertLogin(client, LOGINS.deploy, passwords.deploy);
    await client.query('COMMIT');
    await fileHandle.writeFile(`${variableLines(passwords).join('\n')}\n`);
  } finally {
    await client.end().catch(() => undefined);
    await fileHandle.close();
  }
  return `Roles prontas. Variáveis gravadas em ${absolutePath}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await bootstrapRoles());
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Preparação das roles falhou');
    process.exitCode = 1;
  }
}
