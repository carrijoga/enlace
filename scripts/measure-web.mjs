import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'apps/web/.svelte-kit/output');
const client = resolve(output, 'client');
const manifest = JSON.parse(readFileSync(resolve(client, '.vite/manifest.json'), 'utf8'));
const byFile = new Map(Object.entries(manifest).map(([key, item]) => [normalize(item.file), key]));
const budgetBytes = 150 * 1024;

function normalize(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^\.\//, '');
}

function routeHtml(route) {
  const candidates =
    route === '/' ? ['index.html'] : [`${route.slice(1)}.html`, `${route.slice(1)}/index.html`];
  const file = candidates
    .map((name) => resolve(output, 'prerendered/pages', name))
    .find(existsSync);
  if (!file)
    throw new Error(`HTML prerenderizado não encontrado para ${route}: ${candidates.join(' ou ')}`);
  return { file, html: readFileSync(file, 'utf8') };
}

function staticEntryFiles(route, html, htmlFile) {
  const entries = new Set();
  const pageRelativePath = htmlFile
    .slice(resolve(output, 'prerendered/pages').length)
    .replaceAll('\\', '/')
    .replace(/^\/+/, '');
  const pageUrl = new URL(pageRelativePath, 'https://enlace.invalid/');

  // O SvelteKit pode emitir URLs relativas à página (./ ou ../) ou absolutas.
  // Consideramos scripts module e preloads module; imagens/CSS não entram na métrica.
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const source = tag[0];
    const isModuleScript = /<script\b[^>]*\btype=["']module["']/i.test(source);
    const isModulePreload = /<link\b[^>]*\brel=["']modulepreload["']/i.test(source);
    if (!isModuleScript && !isModulePreload) continue;
    const attr = isModuleScript ? 'src' : 'href';
    const match = source.match(new RegExp(`\\b${attr}=["']([^"']+\\.js(?:\\?[^"']*)?)["']`, 'i'));
    if (!match) continue;
    const resolvedPath = new URL(match[1], pageUrl).pathname;
    const file = normalize(resolvedPath);
    const key = byFile.get(file);
    if (!key)
      throw new Error(
        `Arquivo inicial ausente do manifesto para ${route}: ${match[1]} (resolvido como ${file})`,
      );
    entries.add(key);
  }
  return entries;
}

function measure(route) {
  const { file, html } = routeHtml(route);
  const initial = new Set();
  const visited = new Set();

  // Segue somente imports estáticos do manifesto. dynamicImports são intencionalmente
  // excluídos, pois representam código carregado depois da entrada na rota.
  function add(key) {
    const item = manifest[key];
    if (!item) throw new Error(`Chunk ausente do manifesto: ${key}`);
    if (visited.has(key)) return;
    visited.add(key);
    if (item.file.endsWith('.js')) initial.add(item.file);
    for (const dependency of item.imports ?? []) add(dependency);
  }

  for (const key of staticEntryFiles(route, html, file)) add(key);
  if (!initial.size) throw new Error(`Nenhum chunk JavaScript inicial encontrado para ${route}.`);

  const chunks = [...initial].sort().map((name) => {
    const source = readFileSync(resolve(client, name));
    return { file: name, bytes: source.byteLength, gzipBytes: gzipSync(source).byteLength };
  });
  const gzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  return {
    route,
    measurement: 'build de produção, soma gzip por chunk JavaScript inicial',
    gzipBytes,
    gzipKiB: Number((gzipBytes / 1024).toFixed(2)),
    budgetBytes,
    withinBudget: gzipBytes <= budgetBytes,
    chunks,
  };
}

const results = ['/', '/editor'].map(measure);
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.withinBudget)) process.exitCode = 1;
