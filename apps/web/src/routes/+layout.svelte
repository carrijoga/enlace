<script lang="ts">
  import '../styles.css';
  import { browser, dev } from '$app/env';
  import { inject } from '@vercel/analytics';

  // O helper `@vercel/analytics/sveltekit` depende de `$app/environment` e
  // `$app/stores`, removidos no SvelteKit 3; `inject` rastreia navegações via pushState.
  if (browser) inject({ mode: dev ? 'development' : 'production', framework: 'sveltekit' });

  let { children } = $props();
</script>

{@render children()}
