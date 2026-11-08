import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from './auth.js';
import type { ApiConfig } from './config.js';
import { createMailSender } from './mail.js';

const pools: Pool[] = [];
function pool() {
  const instance = new Pool({
    connectionString: 'postgres://enlace:enlace@127.0.0.1:1/enlace',
    connectionTimeoutMillis: 50,
  });
  pools.push(instance);
  return instance;
}
const config: ApiConfig = {
  port: 3001,
  webOrigin: 'http://localhost:5173',
  version: '0.1.0',
  production: false,
};

afterEach(async () => {
  await Promise.all(pools.splice(0).map((item) => item.end()));
});

describe('Better Auth configuration', () => {
  it('does not construct auth without an explicit secret', () => {
    expect(createAuth(pool(), config)).toBeUndefined();
  });

  it('constructs the Better Auth handler with a configured secret', () => {
    const auth = createAuth(pool(), { ...config, authSecret: 's'.repeat(32) });
    expect(auth).toBeDefined();
    expect(auth?.handler).toEqual(expect.any(Function));
    expect(auth?.api.getSession).toEqual(expect.any(Function));
  });

  it('configures production cookies as Secure, HttpOnly and SameSite=Lax without cookie caching', () => {
    const production = {
      ...config,
      webOrigin: 'https://enlace.example',
      production: true,
      authSecret: 's'.repeat(32),
    };
    const auth = createAuth(pool(), production)!;
    const advanced = auth.options.advanced;
    expect(advanced?.useSecureCookies).toBe(true);
    expect(advanced?.defaultCookieAttributes).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
  });

  it('creates no sender without complete SMTP configuration', () => {
    expect(createMailSender(config)).toBeUndefined();
    expect(createMailSender({ ...config, smtpHost: 'localhost', smtpPort: 1025 })).toBeUndefined();
  });

  it('creates a sender for complete SMTP configuration without sending during setup', () => {
    const sender = createMailSender({
      ...config,
      smtpHost: '127.0.0.1',
      smtpPort: 1025,
      smtpFrom: 'test@example.com',
    });
    expect(sender).toEqual(expect.any(Function));
    expect(vi.isMockFunction(sender)).toBe(false);
  });
});
