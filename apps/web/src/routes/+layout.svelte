<script lang="ts">
  import '../styles.css';
  import { browser, dev } from '$app/env';
  import { onNavigate } from '$app/navigation';
  import { inject } from '@vercel/analytics';
  import { sanitizeAnalyticsEvent } from '../lib/analytics-privacy.js';
  import { prefersReducedMotion } from '../lib/motion';

  // O helper `@vercel/analytics/sveltekit` depende de `$app/environment` e
  // `$app/stores`, removidos no SvelteKit 3; `inject` rastreia navegações via pushState.
  if (browser)
    inject({
      mode: dev ? 'development' : 'production',
      framework: 'sveltekit',
      // Analytics should never receive project IDs, reset tokens, or other query/hash values.
      beforeSend: (event) => sanitizeAnalyticsEvent(event, window.location.origin),
    });

  // Troca de tela em fusão, onde o navegador oferece View Transitions; nos demais, troca direta.
  onNavigate((navigation) => {
    if (!document.startViewTransition || prefersReducedMotion()) return;
    return new Promise((ready) => {
      document.startViewTransition(async () => {
        ready();
        await navigation.complete;
      });
    });
  });

  let { children } = $props();
</script>

{@render children()}
