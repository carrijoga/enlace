import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsEvent } from './analytics-privacy.js';

describe('privacidade das page views', () => {
  it('remove query e fragmento da URL do editor', () => {
    expect(
      sanitizeAnalyticsEvent(
        { type: 'pageview', url: '/editor?project=uuid-secreto#detalhe' },
        'https://enlace.example',
      ),
    ).toEqual({ type: 'pageview', url: 'https://enlace.example/editor' });
  });

  it.each(['/conta?token=segredo', '/conta/redefinir/senha-token', '/projetos?id=privado'])(
    'descarta rota privada %s',
    (url) => {
      expect(
        sanitizeAnalyticsEvent({ type: 'pageview', url }, 'https://enlace.example'),
      ).toBeNull();
    },
  );
});
