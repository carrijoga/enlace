export type AccountSession = {
  user: { id: string; name: string; email: string };
  session: { id: string; expiresAt: string };
};

export type AuthCapabilities = { passwordReset: boolean; google: boolean };

/** Erro de autenticação que preserva o código e o status devolvidos pela API. */
export class AuthRequestError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'AuthRequestError';
    this.code = options.code;
    this.status = options.status;
  }
}

export async function readSession(signal?: AbortSignal): Promise<AccountSession | null> {
  const response = await fetch('/api/auth/get-session', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('Não foi possível consultar sua conta.');
  return (await response.json()) as AccountSession | null;
}

export async function readCapabilities(): Promise<AuthCapabilities> {
  try {
    const response = await fetch('/api/auth-capabilities');
    const value = response.ok ? await response.json() : null;
    return { passwordReset: value?.passwordReset === true, google: value?.google === true };
  } catch {
    return { passwordReset: false, google: false };
  }
}

/** Provedores conectados à conta (`credential` = tem senha, `google`). */
export async function listAccountProviders(): Promise<string[]> {
  const response = await fetch('/api/auth/list-accounts', { credentials: 'same-origin' });
  if (!response.ok) throw new AuthRequestError('Não foi possível consultar sua conta.');
  const data: unknown = await response.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) =>
    item &&
    typeof item === 'object' &&
    typeof (item as { providerId?: unknown }).providerId === 'string'
      ? [(item as { providerId: string }).providerId]
      : [],
  );
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
    const code = typeof data.code === 'string' ? data.code : undefined;
    const status = response.status;
    const fail = (text: string, overrideCode = code) =>
      new AuthRequestError(text, { code: overrideCode, status });
    if (code === 'REAUTH_REQUIRED')
      throw fail('Por segurança, confirme sua identidade com o Google.');
    if (
      path === 'delete-user' &&
      (code === 'INVALID_PASSWORD' || message.toLowerCase() === 'invalid password')
    )
      throw fail('A senha não confere. Confira e tente novamente.');
    if (status === 401) throw fail('Confira seu e-mail e sua senha.');
    if (status === 429) throw fail('Muitas tentativas. Aguarde um pouco e tente novamente.');
    throw fail(message || 'Não foi possível concluir. Tente novamente.');
  }
  return data;
}

export function authError(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível conectar. Tente novamente.';
}

/** Mensagem para o código `?error=` devolvido pelo retorno do OAuth. */
export function oauthErrorMessage(code: string): { text: string; alert: boolean } {
  if (code === 'account_not_linked')
    return {
      text: 'Já existe uma conta com este e-mail. Entre com seu e-mail e senha; depois, em Conta, você pode conectar o Google.',
      alert: true,
    };
  if (code === 'access_denied')
    return {
      text: 'Tudo bem, você cancelou a entrada com o Google. Quando quiser, é só tentar de novo.',
      alert: false,
    };
  // Erros do "Conectar Google" (link-social), que só acontece com a pessoa logada.
  if (code === 'account_already_linked_to_different_user')
    return {
      text: 'Essa conta Google já está ligada a outra conta do Enlace. Escolha outra conta Google ou, se quiser trazê-la para cá, entre com ela, exclua aquela conta e conecte de novo.',
      alert: true,
    };
  if (code === 'unable_to_link_account' || code === 'email_does_not_match')
    return {
      text: 'Não foi possível conectar o Google à sua conta. Tente novamente.',
      alert: true,
    };
  return { text: 'Não foi possível entrar com o Google. Tente novamente.', alert: true };
}

/** Inicia o fluxo social e devolve a URL do provedor; a navegação fica com quem chama. */
export async function startSocial(
  path: 'sign-in/social' | 'link-social',
  origin: string,
  callbackPath: string,
): Promise<string> {
  const data = await authRequest(path, {
    provider: 'google',
    callbackURL: `${origin}${callbackPath}`,
    errorCallbackURL: `${origin}/conta`,
  });
  if (typeof data.url !== 'string' || !data.url)
    throw new AuthRequestError('Não foi possível entrar com o Google. Tente novamente.');
  return data.url;
}
