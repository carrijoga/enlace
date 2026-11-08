import { healthResponseSchema } from '@enlace/contracts';

export function resolveApiOrigin(value: string | undefined, production: boolean): URL {
  if (!value && production) throw new Error('API_ORIGIN obrigatória em produção');
  const url = new URL(value || 'http://localhost:3001');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (production && url.protocol !== 'https:')
  ) {
    throw new Error('API_ORIGIN deve ser uma origem HTTP(S), HTTPS em produção');
  }
  return url;
}

export async function fetchApiHealth(
  origin: URL,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
) {
  const response = await fetcher(new URL('/health', origin), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('API indisponível');
  return healthResponseSchema.parse(await response.json());
}
