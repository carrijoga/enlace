import { MAX_PROJECT_FILE_BYTES } from '@enlace/contracts';

const allowedPath =
  /^\/api\/(?:auth\/[a-z0-9/-]+|auth-capabilities|projects(?:\/[0-9a-f-]{36})?)$/i;
const safeMethods = new Set(['GET', 'HEAD']);

/** Fixed upstream, bounded bodies and explicit header allowlists. Never an open proxy. */
export async function proxyApi(request: Request, origin: URL, fetcher: typeof fetch = fetch) {
  const incoming = new URL(request.url);
  const responseHeaders = { 'cache-control': 'no-store' };
  if (!allowedPath.test(incoming.pathname)) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: responseHeaders });
  }
  if (!['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].includes(request.method)) {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: responseHeaders },
    );
  }
  if (!safeMethods.has(request.method) && request.headers.get('origin') !== incoming.origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403, headers: responseHeaders });
  }
  const headers = new Headers({ accept: 'application/json' });
  for (const key of ['cookie', 'content-type', 'origin']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  let body: Uint8Array | undefined;
  if (!safeMethods.has(request.method)) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return Response.json(
        { error: 'invalid_content_type' },
        { status: 415, headers: responseHeaders },
      );
    }
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_PROJECT_FILE_BYTES) {
          await reader.cancel();
          return Response.json(
            { error: 'payload_too_large' },
            { status: 413, headers: responseHeaders },
          );
        }
        chunks.push(chunk.value);
      }
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
  }
  try {
    const target = new URL(incoming.pathname + incoming.search, origin);
    const upstream = await fetcher(target, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const outgoing = new Headers(responseHeaders);
    for (const name of ['content-type', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) outgoing.append('set-cookie', cookie);
    // Better Auth recovery redirects may only return to this frontend origin.
    const location = upstream.headers.get('location');
    if (location) {
      const redirect = new URL(location, incoming.origin);
      if (redirect.origin !== incoming.origin) throw new Error('invalid_redirect');
      outgoing.set('location', redirect.href);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json({ error: 'api_unavailable' }, { status: 503, headers: responseHeaders });
  }
}
