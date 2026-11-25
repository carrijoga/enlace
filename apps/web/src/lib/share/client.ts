import {
  redeemShareLinkResponseSchema,
  shareLinkListResponseSchema,
  shareLinkSchema,
  sharedViewSchema,
  shareTokenSchema,
  type CeremonyProject,
  type CreateShareLinkRequest,
  type RedeemShareLinkRequest,
  type Reception,
  type ShareLink,
  type ShareLinkMode,
  type SharedView,
} from '@enlace/contracts';

// O token fica no fragmento, que o navegador omite do Referer e das requisições de página.
// Só os POSTs de visualização e resgate recebem o token, no corpo da requisição.

export class ShareError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'rate_limited'
      | 'share_link_limit'
      | 'unauthenticated'
      | 'unavailable'
      | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

export function shareUrl(origin: string, token: string, mode: ShareLinkMode): string {
  if (mode === 'edit' || mode === 'clone') return `${origin}/participar#${mode}.${token}`;
  return `${origin}/ver#${token}`;
}

/** Lê o token do fragmento. Devolve `null` para qualquer coisa fora do formato. */
export function tokenFromHash(hash: string): string | null {
  const candidate = hash.startsWith('#') ? hash.slice(1) : hash;
  return shareTokenSchema.safeParse(candidate).success ? candidate : null;
}

export function participationFromHash(hash: string): RedeemShareLinkRequest | null {
  const [mode, value, extra] = hash.slice(1).split('.');
  if (
    !hash.startsWith('#') ||
    (mode !== 'edit' && mode !== 'clone') ||
    !value ||
    extra !== undefined
  )
    return null;
  return shareTokenSchema.safeParse(value).success ? { token: value, mode } : null;
}

export function participationReturnPath(accountUrl: URL, participationPath: string): string | null {
  if (
    accountUrl.searchParams.get('next') !== participationPath ||
    !participationFromHash(accountUrl.hash)
  )
    return null;
  return `${participationPath}${accountUrl.hash}`;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new ShareError(
      'failed',
      'Não foi possível conectar. Verifique a internet e tente de novo.',
    );
  }
  if (response.status === 204) return null;
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (response.ok) return data;
  const code = typeof data.error === 'string' ? data.error : '';
  if (response.status === 404 || code === 'not_found')
    throw new ShareError('not_found', 'Este link não está mais disponível.');
  if (response.status === 429)
    throw new ShareError(
      'rate_limited',
      'Muitos acessos agora. Aguarde um minuto e tente de novo.',
    );
  if (code === 'share_link_limit')
    throw new ShareError(
      'share_link_limit',
      'Este projeto já tem 10 links ativos. Desative um para criar outro.',
    );
  if (response.status === 401)
    throw new ShareError('unauthenticated', 'Sua sessão terminou. Entre novamente.');
  if (response.status === 503)
    throw new ShareError('unavailable', 'O compartilhamento está indisponível no momento.');
  throw new ShareError('failed', 'Não foi possível concluir. Tente novamente.');
}

const linksPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/share-links`;

export async function listShareLinks(projectId: string): Promise<ShareLink[]> {
  return shareLinkListResponseSchema.parse(await call(linksPath(projectId))).links;
}

export async function createShareLink(
  projectId: string,
  input: CreateShareLinkRequest,
): Promise<ShareLink> {
  return shareLinkSchema.parse(
    await call(linksPath(projectId), { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function revokeShareLink(projectId: string, linkId: string): Promise<void> {
  await call(`${linksPath(projectId)}/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
    body: '{}',
  });
}

export async function fetchSharedView(token: string): Promise<SharedView> {
  const data = await call('/api/shared/view', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  // Resposta fora do contrato não é exibida: pode ser de outra versão ou de um proxy.
  const parsed = sharedViewSchema.safeParse(data);
  if (!parsed.success) throw new ShareError('failed', 'Não foi possível abrir esta planta.');
  return parsed.data;
}

export async function redeemShareLink(input: RedeemShareLinkRequest): Promise<string> {
  const data = await call('/api/shared/redeem', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const parsed = redeemShareLinkResponseSchema.safeParse(data);
  if (!parsed.success)
    throw new ShareError('failed', 'Não foi possível abrir o projeto. Tente de novo.');
  return parsed.data.projectId;
}

/**
 * Converte a projeção pública no formato que a planta e a lista já desenham. Cada pessoa ganha o
 * id da própria cadeira, que é único; no modo `plan` não existe nome, só "ocupada".
 */
export function toViewProject(view: SharedView): CeremonyProject {
  const occupied =
    view.mode === 'names'
      ? view.seats
      : view.occupiedSeatIds.map((seatId) => ({
          seatId,
          name: 'Ocupada',
          category: 'convidado' as const,
        }));
  return {
    title: coupleTitle(view.couple),
    couple: view.couple,
    weddingDate: view.weddingDate,
    layout: { ...view.layout, linkedCounts: false },
    guestCategories: view.mode === 'names' ? view.guestCategories : [],
    guests: occupied.map((seat) => ({
      id: seat.seatId,
      name: seat.name,
      category: seat.category,
      note: '',
    })),
    assignments: occupied.map((seat) => ({ seatId: seat.seatId, guestId: seat.seatId })),
  };
}

/**
 * Festa da projeção pública no formato que `ReceptionCanvas` desenha: sem atribuições (a página
 * não tem IDs de convidado) e com a ocupação por mesa já contada.
 */
export function toViewReception(view: SharedView): {
  reception: Reception;
  occupancy: Map<string, number>;
} | null {
  const source = view.reception;
  if (!source) return null;
  const occupancy = new Map<string, number>();
  if ('guests' in source)
    for (const guest of source.guests)
      occupancy.set(guest.tableId, (occupancy.get(guest.tableId) ?? 0) + 1);
  else for (const count of source.tableCounts) occupancy.set(count.tableId, count.occupied);
  return {
    reception: {
      room: source.room,
      tables: source.tables,
      items: source.items,
      tableAssignments: [],
    },
    occupancy,
  };
}

export function coupleTitle(couple: SharedView['couple']): string {
  const names = [couple.first, couple.second].map((name) => name.trim()).filter(Boolean);
  return names.length ? `Cerimônia de ${names.join(' & ')}` : 'Planta da cerimônia';
}

/** Busca sem acento e sem diferença de maiúsculas: "joao" acha "João". */
export function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

export const EXPIRY_OPTIONS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: null, label: 'Sem prazo' },
] as const;
