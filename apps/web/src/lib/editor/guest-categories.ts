import type { CeremonyProject } from '@enlace/contracts';

export type GuestCategory = CeremonyProject['guests'][number]['category'];

export const GUEST_CATEGORIES: Record<
  GuestCategory,
  { label: string; fill: string; stroke: string; text: string }
> = {
  familia: { label: 'Família', fill: '#e8f0e7', stroke: '#8ca98c', text: '#294b32' },
  padrinho: { label: 'Padrinho', fill: '#f2ead8', stroke: '#c8ae79', text: '#5e4b27' },
  madrinha: { label: 'Madrinha', fill: '#f2ead8', stroke: '#c8ae79', text: '#5e4b27' },
  pajem: { label: 'Pajem', fill: '#eee9f5', stroke: '#b3a3ca', text: '#4d3d65' },
  convidado: { label: 'Convidado', fill: '#eeefeb', stroke: '#b9beb5', text: '#485149' },
};

export const GUEST_CATEGORY_OPTIONS = Object.entries(GUEST_CATEGORIES).map(([value, category]) => ({
  value: value as GuestCategory,
  ...category,
}));
