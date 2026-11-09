export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Duração para transições do Svelte, que rodam em JS e não obedecem às regras de CSS. */
export function motionMs(duration: number): number {
  return prefersReducedMotion() ? 0 : duration;
}
