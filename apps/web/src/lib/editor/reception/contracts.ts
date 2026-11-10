/**
 * Contrato entre os componentes da planta da festa (fase 6, etapa 4). Tudo nesta pasta é carregado
 * sob demanda por `ReceptionEditor.svelte`; nada aqui pode ser importado pela rota do editor de
 * forma estática, para não aumentar o JavaScript inicial da cerimônia.
 *
 * Unidades: centímetros inteiros no projeto; a interface mostra metros com vírgula
 * (`formatMeters`/`parseMeters` de `@enlace/domain/reception`).
 */
import type {
  Project,
  Reception,
  ReceptionColumn,
  ReceptionDoor,
  ReceptionItem,
  ReceptionItemKind,
  ReceptionTable,
  RoomPoint,
} from '@enlace/contracts';
import type { ReceptionElementRef } from '@enlace/domain/reception';

export type { ReceptionElementRef };

export type TablePatch = Partial<
  Pick<ReceptionTable, 'name' | 'shape' | 'x' | 'y' | 'rotation' | 'width' | 'depth'>
>;
export type ItemPatch = Partial<Omit<ReceptionItem, 'id' | 'kind'>>;
export type ColumnPatch = Partial<Omit<ReceptionColumn, 'id'>>;

export const sameRef = (a: ReceptionElementRef | null, b: ReceptionElementRef | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** Planta SVG: desenha e move elementos. Não altera o projeto; só emite eventos. */
export type ReceptionCanvasProps = {
  reception: Reception;
  /** Convidados atribuídos por mesa (`tableId` → quantidade). */
  occupancy: ReadonlyMap<string, number>;
  /** IDs de mesas, elementos e colunas com algum aviso. */
  warnedIds: ReadonlySet<string>;
  selected: ReceptionElementRef | null;
  /** Há um convidado escolhido esperando mesa: tocar numa mesa a atribui. */
  assigning: boolean;
  onSelect: (ref: ReceptionElementRef | null) => void;
  /** Centro novo, já encaixado na grade de 10 cm e dentro de 0..10000. Chamado ao soltar ou por seta. */
  onMove: (ref: ReceptionElementRef, x: number, y: number) => void;
};

/** Formatos prontos e salão manual. Sem `outline`, cria a planta; com ele, troca o contorno. */
export type RoomSetupProps = {
  outline: readonly RoomPoint[] | null;
  doors: readonly ReceptionDoor[];
  /** Recebe um contorno já validado por `findRoomOutlineError`. */
  onApplyOutline: (outline: RoomPoint[]) => void;
  onAddDoor: (door: Omit<ReceptionDoor, 'id'>) => void;
  onRemoveDoor: (doorId: string) => void;
  onAddColumn: () => void;
};

/** Painel de propriedades do elemento selecionado e botões de inclusão. */
export type ElementInspectorProps = {
  reception: Reception;
  selected: ReceptionElementRef | null;
  occupancy: ReadonlyMap<string, number>;
  onAddTable: (shape: ReceptionTable['shape']) => void;
  onAddItem: (kind: ReceptionItemKind, name?: string) => void;
  onUpdateTable: (id: string, patch: TablePatch) => void;
  /** O editor confirma antes se alguém perder a mesa. */
  onSetSeats: (id: string, seats: number) => void;
  onUpdateItem: (id: string, patch: ItemPatch) => void;
  onUpdateColumn: (id: string, patch: ColumnPatch) => void;
  onDuplicate: (ref: ReceptionElementRef) => void;
  /** O editor confirma antes se a mesa tiver convidados. */
  onRemove: (ref: ReceptionElementRef) => void;
  onClose: () => void;
};

/** Convidados por mesa e alternativa sem arraste para atribuir. */
export type TableGuestsProps = {
  project: Project & { reception: Reception };
  selectedTableId: string | null;
  selectedGuestId: string | null;
  onSelectGuest: (guestId: string | null) => void;
  onSelectTable: (tableId: string) => void;
  onAssign: (guestId: string, tableId: string) => void;
  onUnassign: (guestId: string) => void;
};

/** "Ver salão em lista": todos os elementos com posição, medidas e avisos, para teclado e leitor de tela. */
export type ElementListProps = {
  reception: Reception;
  occupancy: ReadonlyMap<string, number>;
  /** Mensagens de aviso já formatadas por elemento. */
  warningsById: ReadonlyMap<string, readonly string[]>;
  selected: ReceptionElementRef | null;
  onSelect: (ref: ReceptionElementRef) => void;
};
