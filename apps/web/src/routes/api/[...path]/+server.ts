import { resolveApiOrigin } from '../../../lib/server/api-health';
import { proxyApi } from '../../../lib/server/api-proxy';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ request }) => {
  try {
    return await proxyApi(
      request,
      resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV === 'production'),
    );
  } catch {
    return Response.json(
      { error: 'api_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
};
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
