export function validateRestoreTarget(env: NodeJS.ProcessEnv): {
  connectionString: string;
  archive: string;
  targetName: string;
};
