import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'apps/web/.svelte-kit/output');
const manifest = JSON.parse(readFileSync(resolve(output, 'client/.vite/manifest.json'), 'utf8'));
const html = readFileSync(resolve(output, 'prerendered/pages/index.html'), 'utf8');
const byFile = new Map(Object.entries(manifest).map(([key, item]) => [item.file, key]));
const initial = new Set();

// O HTML prerenderizado declara os chunks da hidratação e da rota inicial.
// Percorrer apenas imports estáticos mantém os contratos lazy fora da soma inicial.
function add(key) {
  const item = manifest[key];
  if (!item) throw new Error(`Chunk ausente do manifesto: ${key}`);
  if (initial.has(item.file)) return;
  initial.add(item.file);
  for (const dependency of item.imports ?? []) add(dependency);
}

for (const match of html.matchAll(/(?:href=|import\()["']\.\/(_app\/[^"']+\.js)["']/g)) {
  const key = byFile.get(match[1]);
  if (!key) throw new Error(`Arquivo inicial ausente do manifesto: ${match[1]}`);
  add(key);
}
if (!initial.size)
  throw new Error('Nenhum JavaScript inicial encontrado. Execute pnpm run build:web.');

const chunks = [...initial].sort().map((file) => {
  const source = readFileSync(resolve(output, 'client', file));
  return { file, bytes: source.byteLength, gzipBytes: gzipSync(source).byteLength };
});
const gzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
const budgetBytes = 150 * 1024;
console.log(
  JSON.stringify(
    {
      route: '/',
      measurement: 'build de produção, soma gzip por chunk inicial',
      gzipBytes,
      gzipKiB: Number((gzipBytes / 1024).toFixed(2)),
      budgetBytes,
      withinBudget: gzipBytes <= budgetBytes,
      chunks,
    },
    null,
    2,
  ),
);
if (gzipBytes > budgetBytes) process.exitCode = 1;
