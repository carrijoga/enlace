import { createHmac, timingSafeEqual } from 'node:crypto';
import { SHARE_TOKEN_LENGTH } from '@enlace/contracts';

// ADR-0014: token = base64url(linkId[16] ‖ HMAC-SHA256(segredo, contexto ‖ linkId)[32]).
// O banco guarda só o linkId; sem o segredo, uma cópia do banco não monta links válidos.
const CONTEXT = Buffer.from('enlace-share-link:v1:', 'utf8');
const ID_BYTES = 16;
const MAC_BYTES = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mac(secret: string, id: Buffer): Buffer {
  return createHmac('sha256', secret).update(CONTEXT).update(id).digest();
}

export function createShareToken(secret: string, linkId: string): string {
  if (!UUID.test(linkId)) throw new Error('linkId inválido');
  const id = Buffer.from(linkId.replaceAll('-', ''), 'hex');
  return Buffer.concat([id, mac(secret, id)]).toString('base64url');
}

/** Devolve o linkId se o token foi emitido com este segredo; `null` em qualquer outro caso. */
export function verifyShareToken(secret: string, token: unknown): string | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  if (token.length !== SHARE_TOKEN_LENGTH) return null;
  const raw = Buffer.from(token, 'base64url');
  // Recusa codificações não canônicas que decodificariam para os mesmos bytes.
  if (raw.length !== ID_BYTES + MAC_BYTES || raw.toString('base64url') !== token) return null;
  const id = raw.subarray(0, ID_BYTES);
  if (!timingSafeEqual(raw.subarray(ID_BYTES), mac(secret, id))) return null;
  const hex = id.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
