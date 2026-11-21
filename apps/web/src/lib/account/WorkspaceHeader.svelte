<script lang="ts">
  import { resolve } from '$app/paths';

  let {
    current,
    accountLabel = 'Minha conta',
  }: {
    current: 'inicio' | 'conta' | 'projetos';
    accountLabel?: string;
  } = $props();
</script>

<header class="site-header" class:landing={current === 'inicio'}>
  <a
    class="brand"
    href={resolve('/')}
    aria-label="Enlace, início"
    aria-current={current === 'inicio' ? 'page' : undefined}
  >
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <ellipse pathLength="1" cx="14" cy="18" rx="8" ry="11" />
      <ellipse pathLength="1" cx="23" cy="18" rx="8" ry="11" />
    </svg>
    <span>enlace</span>
  </a>
  <nav aria-label="Principal">
    <a href={resolve('/projetos')} aria-current={current === 'projetos' ? 'page' : undefined}
      >Meus projetos</a
    >
    <a href={resolve('/conta')} aria-current={current === 'conta' ? 'page' : undefined}
      >{accountLabel}</a
    >
    <a class="local" href={resolve('/editor')}>Editor local</a>
  </nav>
</header>

<style>
  .site-header {
    min-height: 84px;
    gap: 24px;
  }
  nav {
    display: flex;
    align-items: center;
    gap: clamp(16px, 3vw, 34px);
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    border-block: 2px solid transparent;
    color: var(--muted);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
  }
  nav a[aria-current='page'] {
    color: var(--green);
    border-bottom-color: var(--green);
  }
  nav a:hover {
    color: var(--green);
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  nav .local {
    font-weight: 400;
  }
  @media (prefers-reduced-motion: no-preference) {
    .landing ellipse {
      stroke-dasharray: 1;
      animation: trace 760ms ease-out backwards;
      transition: transform var(--dur-slow) var(--ease-out);
    }
    .landing ellipse:last-child {
      animation-delay: 160ms;
    }
    .landing .brand:hover ellipse:first-child {
      transform: translateX(1.5px);
    }
    .landing .brand:hover ellipse:last-child {
      transform: translateX(-1.5px);
    }
    @keyframes trace {
      from {
        stroke-dashoffset: 1;
      }
    }
  }
  @media (max-width: 500px) {
    .site-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
      padding-top: 16px;
    }
    nav {
      width: 100%;
      gap: 20px;
    }
    nav a {
      font-size: 13px;
    }
    nav .local {
      margin-left: auto;
    }
  }
</style>
