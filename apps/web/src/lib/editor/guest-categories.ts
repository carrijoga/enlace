// Só tipos: este módulo entra na página inicial, que não carrega o Zod dos contratos.
import type {
  BuiltinGuestCategory,
  CustomGuestCategory,
  GuestCategoryColor,
  Project,
} from '@enlace/contracts';

/** Categoria padrão ou o `id` de uma categoria personalizada do projeto. */
export type GuestCategory = Project['guests'][number]['category'];
export type CategoryStyle = { label: string; fill: string; stroke: string; text: string };
export type CategoryOption = CategoryStyle & { value: GuestCategory; custom: boolean };

const style = (label: string, fill: string, stroke: string, text: string): CategoryStyle => ({
  label,
  fill,
  stroke,
  text,
});

/** Rótulos iguais a `BUILTIN_GUEST_CATEGORY_LABELS` dos contratos (conferido em teste). */
export const GUEST_CATEGORIES: Record<BuiltinGuestCategory, CategoryStyle> = {
  familia: style('Família', '#e8f0e7', '#8ca98c', '#294b32'),
  padrinho: style('Padrinho', '#f2ead8', '#c8ae79', '#5e4b27'),
  madrinha: style('Madrinha', '#f2ead8', '#c8ae79', '#5e4b27'),
  pajem: style('Pajem', '#eee9f5', '#b3a3ca', '#4d3d65'),
  convidado: style('Convidado', '#eeefeb', '#b9beb5', '#485149'),
};

/** Cores das categorias personalizadas; o texto mantém contraste AA sobre o preenchimento. */
export const CUSTOM_CATEGORY_COLORS: Record<GuestCategoryColor, CategoryStyle> = {
  rosa: style('Rosa', '#f7e4e8', '#c98d9b', '#6b2f3d'),
  azul: style('Azul', '#e3ecf5', '#8aa8c8', '#2c4a6b'),
  terracota: style('Terracota', '#f5e3da', '#c98f72', '#6b3a24'),
  oliva: style('Oliva', '#eef0dc', '#a9ad6e', '#4a4d1f'),
  lavanda: style('Lavanda', '#e6e4f7', '#8f8bd0', '#36326e'),
  mostarda: style('Mostarda', '#f7efcf', '#c9a93a', '#5c4a0c'),
  petroleo: style('Petróleo', '#dfeeee', '#6fa3a3', '#1f4d4d'),
  cinza: style('Cinza', '#e9eaee', '#9a9fae', '#3d4150'),
};

export const isBuiltinCategory = (value: string): value is BuiltinGuestCategory =>
  Object.hasOwn(GUEST_CATEGORIES, value);

/** Categorias padrão seguidas das personalizadas, na ordem em que foram criadas. */
export function categoryOptions(custom: readonly CustomGuestCategory[]): CategoryOption[] {
  return [
    ...Object.entries(GUEST_CATEGORIES).map(([value, category]) => ({
      ...category,
      value: value as GuestCategory,
      custom: false,
    })),
    ...custom.map((category) => ({
      ...CUSTOM_CATEGORY_COLORS[category.color],
      label: category.label,
      value: category.id,
      custom: true,
    })),
  ];
}

/**
 * Estilo de cada categoria do projeto. Uma referência desconhecida (não deveria passar pelo
 * contrato) cai em "Convidado" em vez de quebrar a planta.
 */
export function categoryLookup(
  custom: readonly CustomGuestCategory[],
): (value: GuestCategory) => CategoryStyle {
  const byId = new Map(categoryOptions(custom).map((option) => [option.value, option]));
  return (value) => byId.get(value) ?? GUEST_CATEGORIES.convidado;
}

/** Legenda da planta: padrinhos e madrinhas dividem a cor; as personalizadas vêm depois. */
export function legendEntries(custom: readonly CustomGuestCategory[]): CategoryOption[] {
  return categoryOptions(custom)
    .filter((option) => option.value !== 'madrinha')
    .map((option) => (option.value === 'padrinho' ? { ...option, label: 'Padrinhos' } : option));
}
