import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthRequestError,
  authRequest,
  listAccountProviders,
  oauthErrorMessage,
  startSocial,
} from './client';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('authRequest', () => {
  it('preserva code e status e usa a mensagem de reautenticação', async () => {
    mockFetch(401, { code: 'REAUTH_REQUIRED', message: 'x' });
    const error = await authRequest('delete-user', {}).catch((e) => e);
    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error.code).toBe('REAUTH_REQUIRED');
    expect(error.status).toBe(401);
    expect(error.message).toContain('Google');
  });
  it('mantém as mensagens atuais', async () => {
    mockFetch(401, {});
    await expect(authRequest('sign-in/email', { a: 1 })).rejects.toThrow(
      'Confira seu e-mail e sua senha.',
    );
    mockFetch(429, {});
    await expect(authRequest('sign-in/email', { a: 1 })).rejects.toMatchObject({ status: 429 });
    mockFetch(400, { code: 'INVALID_PASSWORD' });
    await expect(authRequest('delete-user', {})).rejects.toThrow('A senha não confere');
    mockFetch(500, { message: 'Falhou' });
    await expect(authRequest('x', {})).rejects.toThrow('Falhou');
  });
  it('devolve os dados em caso de sucesso', async () => {
    mockFetch(200, { url: 'https://accounts.example.test', redirect: true });
    await expect(authRequest('sign-in/social', {})).resolves.toMatchObject({ redirect: true });
  });
});

describe('startSocial', () => {
  it('envia callbacks na mesma origem e devolve a url', async () => {
    const fn = mockFetch(200, { url: 'https://accounts.example.test/o', redirect: true });
    const url = await startSocial('sign-in/social', 'https://enlace.example.test', '/projetos');
    expect(url).toBe('https://accounts.example.test/o');
    const [path, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/auth/sign-in/social');
    expect(JSON.parse(init.body as string)).toEqual({
      provider: 'google',
      callbackURL: 'https://enlace.example.test/projetos',
      errorCallbackURL: 'https://enlace.example.test/conta',
    });
  });
  it('falha sem url na resposta', async () => {
    mockFetch(200, {});
    await expect(startSocial('link-social', 'https://e.test', '/conta')).rejects.toThrow();
  });
});

describe('listAccountProviders', () => {
  it('lista os providerId', async () => {
    mockFetch(200, [{ providerId: 'credential' }, { providerId: 'google' }, {}]);
    await expect(listAccountProviders()).resolves.toEqual(['credential', 'google']);
  });
});

describe('oauthErrorMessage', () => {
  it('mapeia os códigos', () => {
    expect(oauthErrorMessage('account_not_linked').text).toContain('Já existe uma conta');
    expect(oauthErrorMessage('access_denied').alert).toBe(false);
    expect(oauthErrorMessage('account_already_linked_to_different_user').text).toContain(
      'já está ligada a outra conta',
    );
    expect(oauthErrorMessage('unable_to_link_account').text).toContain('conectar o Google');
    expect(oauthErrorMessage('qualquer').text).toBe(
      'Não foi possível entrar com o Google. Tente novamente.',
    );
  });
});
