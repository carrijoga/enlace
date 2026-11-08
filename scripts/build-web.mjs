import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'apps/web');
const require = createRequire(resolve(web, 'package.json'));
const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const localWindows = process.platform === 'win32';
if (localWindows) {
  console.log(
    'Build para preview local no Windows. O pacote Vercel usa pnpm run build:vercel em Linux/CI.',
  );
}
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: web,
  stdio: 'inherit',
  env: { ...process.env, ...(localWindows ? { ENLACE_PREVIEW_BUILD: '1' } : {}) },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
