import { fetchApiHealth, resolveApiOrigin } from '../../../lib/server/api-health';

export async function GET() {
  try {
    const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV === 'production');
    return Response.json(await fetchApiHealth(origin), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'api_unavailable', message: 'Não foi possível conectar à API. Tente novamente.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
