export type AccountSession = {
  user: { id: string; name: string; email: string };
  session: { id: string; expiresAt: string };
};

export async function readSession(): Promise<AccountSession | null> {
  const response = await fetch('/api/auth/get-session', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível consultar sua conta.');
  return (await response.json()) as AccountSession | null;
}

export async function authRequest(
  path: string,
  payload?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/auth/${path}`, {
    method: payload ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : '';
    if (response.status === 401) throw new Error('Confira seu e-mail e sua senha.');
    if (response.status === 429)
      throw new Error('Muitas tentativas. Aguarde um pouco e tente novamente.');
    throw new Error(message || 'Não foi possível concluir. Tente novamente.');
  }
  return data;
}

export function authError(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível conectar. Tente novamente.';
}
