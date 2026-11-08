import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

describe('readConfig', () => {
  it('allows local development without a database', () => {
    expect(readConfig({ NODE_ENV: 'development' })).toMatchObject({
      port: 3001,
      webOrigin: 'http://localhost:5173',
    });
  });

  it('requires database and HTTPS origin in production', () => {
    expect(() => readConfig({ NODE_ENV: 'production', WEB_ORIGIN: 'http://site.example' })).toThrow(
      /HTTPS/,
    );
    expect(() =>
      readConfig({ NODE_ENV: 'production', WEB_ORIGIN: 'https://site.example' }),
    ).toThrow(/DATABASE_URL/);
    expect(
      readConfig({
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://site.example',
        DATABASE_URL: 'postgres://fake:fake@db.invalid/app',
      }),
    ).toMatchObject({ production: true });
  });

  it('rejects paths and invalid ports', () => {
    expect(() => readConfig({ WEB_ORIGIN: 'http://localhost:5173/path' })).toThrow(/origem/);
    expect(() => readConfig({ PORT: '0' })).toThrow(/PORT/);
  });
});
