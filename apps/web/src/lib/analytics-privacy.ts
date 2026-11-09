export type AnalyticsEvent = { type: 'pageview' | 'event'; url: string };

/** Remove secrets and project IDs before any page-view or custom event leaves the browser. */
export function sanitizeAnalyticsEvent(
  event: AnalyticsEvent,
  origin: string,
): AnalyticsEvent | null {
  const url = new URL(event.url, origin);
  if (/^\/(conta|projetos)(\/|$)/.test(url.pathname)) return null;
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}
