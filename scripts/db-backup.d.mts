export function postgresEnvironment(
  connectionString: string,
  baseEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
export function runBackup(env?: NodeJS.ProcessEnv): Promise<string>;
