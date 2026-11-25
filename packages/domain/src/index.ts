import {
  BUILTIN_GUEST_CATEGORY_LABELS,
  GUEST_CATEGORY_LIMITS,
  categoryLabelKey,
  createUuid,
  projectSchema,
  sharedViewSchema,
  type CeremonyProject,
  type CustomGuestCategory,
  type GuestCategoryColor,
  type Project,
  type SharedView,
} from '@enlace/contracts';

export type SeatGeometry = {
  id: string;
  rowId: string;
  rowIndex: number;
  side: 'left' | 'right';
  index: number;
  x: number;
  y: number;
  angle: number;
  label: string;
};

export type LayoutGeometry = {
  width: number;
  height: number;
  center: number;
  corridorHalf: number;
  seats: SeatGeometry[];
};

const uuid = createUuid;
// Valida o projeto completo, mas devolve o próprio objeto recebido: o parse do Zod cria uma
// cópia profunda, e a cópia faria a interface tratar todos os convidados/fileiras como novos a
// cada comando. Os comandos montam objetos novos só nos trechos alterados (compartilhamento
// estrutural). Entradas externas continuam passando por parse completo nos contratos.
const validate = (project: Project): Project => {
  projectSchema.parse(project);
  return project;
};
const emptyRows = () =>
  [6, 5, 6, 5, 6].map((left) => ({
    id: uuid(),
    leftSeatIds: Array.from({ length: left }, uuid),
    rightSeatIds: Array.from({ length: 11 - left }, uuid),
  }));

export function createInitialProject(): Project {
  return validate({
    title: 'Minha cerimônia',
    couple: { first: '', second: '' },
    weddingDate: null,
    layout: {
      mode: 'straight',
      curveStrength: 50,
      aisleWidth: 1.8,
      linkedCounts: true,
      rows: emptyRows(),
    },
    guestCategories: [],
    guests: [],
    assignments: [],
    reception: null,
  });
}

export function createSampleProject(): Project {
  const project = createInitialProject();
  const guests: Project['guests'] = [
    ['Camila Duarte', 'familia'],
    ['Rafael Duarte', 'familia'],
    ['Joana Reis', 'familia'],
    ['Marcos Reis', 'familia'],
    ['Lia Nascimento', 'padrinho'],
    ['Bruno Nascimento', 'madrinha'],
    ['Sofia Lima', 'pajem'],
    ['Theo Lima', 'pajem'],
    ['Nina Costa', 'convidado'],
    ['Caio Costa', 'convidado'],
  ].map(([name, category]) => ({
    id: uuid(),
    name: name!,
    category: category as Project['guests'][number]['category'],
    note: '',
  }));
  return validate({
    ...project,
    couple: { first: 'Alex', second: 'Ravi' },
    guests,
    assignments: guests.slice(0, 8).map((guest, index) => ({
      seatId: project.layout.rows[Math.floor(index / 2)]!.leftSeatIds[index % 2]!,
      guestId: guest.id,
    })),
  });
}

export function setProjectDetails(
  project: Project,
  patch: Partial<Pick<Project, 'title' | 'couple' | 'weddingDate'>>,
): Project {
  return validate({
    ...project,
    ...patch,
    couple: patch.couple ? { ...project.couple, ...patch.couple } : project.couple,
  });
}

export function setLayout(
  project: Project,
  patch: Partial<Pick<Project['layout'], 'mode' | 'curveStrength' | 'aisleWidth' | 'linkedCounts'>>,
): Project {
  return validate({ ...project, layout: { ...project.layout, ...patch } });
}

export function addRow(project: Project): Project {
  if (project.layout.rows.length >= 12) throw new Error('Limite de 12 fileiras atingido.');
  const previous = project.layout.rows.at(-1)!;
  const left = Math.min(12, previous.leftSeatIds.length + 1);
  const right = Math.min(12, project.layout.linkedCounts ? left : previous.rightSeatIds.length + 1);
  const row = {
    id: uuid(),
    leftSeatIds: Array.from({ length: left }, uuid),
    rightSeatIds: Array.from({ length: right }, uuid),
  };
  return validate({
    ...project,
    layout: { ...project.layout, rows: [...project.layout.rows, row] },
  });
}

export function removeRow(project: Project, rowId: string): Project {
  const row = project.layout.rows.find((candidate) => candidate.id === rowId);
  if (!row) throw new Error('Fileira inexistente.');
  if (project.layout.rows.length === 1)
    throw new Error('O projeto precisa manter ao menos uma fileira.');
  const ids = new Set([...row.leftSeatIds, ...row.rightSeatIds]);
  return validate({
    ...project,
    layout: {
      ...project.layout,
      rows: project.layout.rows.filter((candidate) => candidate.id !== rowId),
    },
    assignments: project.assignments.filter((a) => !ids.has(a.seatId)),
  });
}

export function setRowCount(
  project: Project,
  rowId: string,
  side: 'left' | 'right',
  count: number,
): Project {
  if (side !== 'left' && side !== 'right') throw new Error('Lado inválido.');
  if (!Number.isInteger(count) || count < 0 || count > 12)
    throw new Error('Contagem deve ser um inteiro entre 0 e 12.');
  if (!project.layout.rows.some((row) => row.id === rowId)) throw new Error('Fileira inexistente.');
  const target = side === 'left' ? 'leftSeatIds' : 'rightSeatIds';
  const other = side === 'left' ? 'rightSeatIds' : 'leftSeatIds';
  const removed = new Set<string>();
  const rows = project.layout.rows.map((row) => {
    if (row.id !== rowId) return row;
    const resize = (ids: string[], nextCount: number) => {
      if (nextCount < ids.length) ids.slice(nextCount).forEach((id) => removed.add(id));
      return ids
        .slice(0, nextCount)
        .concat(Array.from({ length: Math.max(0, nextCount - ids.length) }, uuid));
    };
    const ids = resize(row[target], count);
    return project.layout.linkedCounts
      ? { ...row, [target]: ids, [other]: resize(row[other], count) }
      : { ...row, [target]: ids };
  });
  return validate({
    ...project,
    layout: { ...project.layout, rows },
    assignments: project.assignments.filter((a) => !removed.has(a.seatId)),
  });
}

export function addGuest(project: Project, guest: Project['guests'][number]): Project {
  return validate({ ...project, guests: [...project.guests, guest] });
}
/** Acrescenta um lote de convidados numa única alteração, sem mexer na planta nem atribuir lugares. */
export function addGuests(project: Project, guests: Project['guests']): Project {
  if (!guests.length) return project;
  if (project.guests.length + guests.length > 300)
    throw new Error(
      `O projeto aceita até 300 convidados; há espaço para ${300 - project.guests.length}.`,
    );
  return validate({ ...project, guests: [...project.guests, ...guests] });
}
export function updateGuest(
  project: Project,
  guestId: string,
  patch: Partial<Omit<Project['guests'][number], 'id'>>,
): Project {
  if (!project.guests.some((guest) => guest.id === guestId))
    throw new Error('Convidado inexistente.');
  return validate({
    ...project,
    guests: project.guests.map((guest) => (guest.id === guestId ? { ...guest, ...patch } : guest)),
  });
}
/** Remove o convidado do projeto: da lista, da cadeira da cerimônia e da mesa da festa. */
export function removeGuest(project: Project, guestId: string): Project {
  if (!project.guests.some((guest) => guest.id === guestId))
    throw new Error('Convidado inexistente.');
  const { reception } = project;
  return validate({
    ...project,
    guests: project.guests.filter((guest) => guest.id !== guestId),
    assignments: project.assignments.filter((a) => a.guestId !== guestId),
    reception:
      reception && reception.tableAssignments.some((a) => a.guestId === guestId)
        ? {
            ...reception,
            tableAssignments: reception.tableAssignments.filter((a) => a.guestId !== guestId),
          }
        : reception,
  });
}
/** Acrescenta uma categoria personalizada ao fim da lista; o nome é aparado e não pode repetir outra. */
export function addGuestCategory(
  project: Project,
  input: { label: string; color: GuestCategoryColor },
): Project {
  if (project.guestCategories.length >= GUEST_CATEGORY_LIMITS.maxCustom)
    throw new Error(`Limite de ${GUEST_CATEGORY_LIMITS.maxCustom} categorias personalizadas.`);
  const category = {
    id: uuid(),
    label: checkedCategoryLabel(project, input.label),
    color: input.color,
  };
  return validate({ ...project, guestCategories: [...project.guestCategories, category] });
}
export function updateGuestCategory(
  project: Project,
  categoryId: string,
  patch: Partial<Pick<CustomGuestCategory, 'label' | 'color'>>,
): Project {
  if (!project.guestCategories.some((category) => category.id === categoryId))
    throw new Error('Categoria inexistente.');
  const label =
    patch.label === undefined ? undefined : checkedCategoryLabel(project, patch.label, categoryId);
  return validate({
    ...project,
    guestCategories: project.guestCategories.map((category) =>
      category.id === categoryId
        ? { ...category, ...patch, ...(label === undefined ? {} : { label }) }
        : category,
    ),
  });
}
/** Quantos convidados usam a categoria: quem estiver nela volta para "Convidado" ao removê-la. */
export function countGuestsInCategory(project: Project, categoryId: string): number {
  return project.guests.filter((guest) => guest.category === categoryId).length;
}
export function removeGuestCategory(project: Project, categoryId: string): Project {
  if (!project.guestCategories.some((category) => category.id === categoryId))
    throw new Error('Categoria inexistente.');
  return validate({
    ...project,
    guestCategories: project.guestCategories.filter((category) => category.id !== categoryId),
    guests: project.guests.some((guest) => guest.category === categoryId)
      ? project.guests.map((guest) =>
          guest.category === categoryId ? { ...guest, category: 'convidado' as const } : guest,
        )
      : project.guests,
  });
}
function checkedCategoryLabel(project: Project, raw: string, exceptId?: string): string {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) throw new Error('Dê um nome à categoria.');
  if (label.length > GUEST_CATEGORY_LIMITS.maxLabelLength)
    throw new Error(
      `O nome da categoria pode ter até ${GUEST_CATEGORY_LIMITS.maxLabelLength} caracteres.`,
    );
  const key = categoryLabelKey(label);
  const taken =
    Object.values(BUILTIN_GUEST_CATEGORY_LABELS).some((other) => categoryLabelKey(other) === key) ||
    project.guestCategories.some(
      (other) => other.id !== exceptId && categoryLabelKey(other.label) === key,
    );
  if (taken) throw new Error('Já existe uma categoria com esse nome.');
  return label;
}

export function assignGuest(project: Project, guestId: string, seatId: string): Project {
  if (!project.guests.some((guest) => guest.id === guestId))
    throw new Error('Convidado inexistente.');
  const seatIds = new Set(
    project.layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]),
  );
  if (!seatIds.has(seatId)) throw new Error('Cadeira inexistente.');
  const guestSeat = project.assignments.find((a) => a.guestId === guestId)?.seatId;
  if (guestSeat === seatId) return project;
  const seatGuest = project.assignments.find((a) => a.seatId === seatId)?.guestId;
  let assignments = project.assignments.filter((a) => a.guestId !== guestId && a.seatId !== seatId);
  if (guestSeat && seatGuest)
    assignments = [...assignments, { seatId: guestSeat, guestId: seatGuest }];
  return validate({ ...project, assignments: [...assignments, { seatId, guestId }] });
}
export function unassignSeat(project: Project, seatId: string): Project {
  const seats = project.layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]);
  if (!seats.includes(seatId)) throw new Error('Cadeira inexistente.');
  return validate({
    ...project,
    assignments: project.assignments.filter((a) => a.seatId !== seatId),
  });
}

export function getLayoutGeometry(layout: Project['layout']): LayoutGeometry {
  const corridorHalf = 35 * layout.aisleWidth;
  const firstX = corridorHalf + 42;
  const maxSide = Math.max(
    1,
    ...layout.rows.flatMap((row) => [row.leftSeatIds.length, row.rightSeatIds.length]),
  );
  const farX = firstX + (maxSide - 1) * 68;
  const width = Math.max(1180, Math.ceil((farX + 72) * 2));
  const center = width / 2;
  const firstY = 318;
  const height = Math.max(825, Math.ceil(firstY + (layout.rows.length - 1) * 103 + 87));
  const curvature = Math.min(
    0.00014 + layout.curveStrength * 0.0000042,
    150 / Math.max(1, farX ** 2 - firstX ** 2),
  );
  const seats: SeatGeometry[] = [];
  layout.rows.forEach((row, rowIndex) => {
    (['left', 'right'] as const).forEach((side) => {
      const ids = side === 'left' ? row.leftSeatIds : row.rightSeatIds;
      ids.forEach((id, index) => {
        const dx = firstX + index * 68;
        const sign = side === 'left' ? -1 : 1;
        const x = center + sign * dx;
        const y =
          firstY +
          rowIndex * 103 -
          (layout.mode === 'curve' ? curvature * (dx ** 2 - firstX ** 2) : 0);
        const angle =
          layout.mode === 'curve' ? (-sign * Math.atan(2 * curvature * dx) * 180) / Math.PI : 0;
        seats.push({
          id,
          rowId: row.id,
          rowIndex,
          side,
          index,
          x,
          y,
          angle,
          label: `Fileira ${rowIndex + 1} · ${side === 'left' ? 'esquerda' : 'direita'} · cadeira ${index + 1}`,
        });
      });
    });
  });
  return { width, height, center, corridorHalf, seats };
}

/** Rótulos de todas as cadeiras, calculados uma vez por planta (evita busca linear por cadeira). */
export function getSeatLabels(layout: Project['layout']): Map<string, string> {
  const labels = new Map<string, string>();
  layout.rows.forEach((row, rowIndex) => {
    row.leftSeatIds.forEach((id, index) =>
      labels.set(id, `Fileira ${rowIndex + 1} · esquerda · cadeira ${index + 1}`),
    );
    row.rightSeatIds.forEach((id, index) =>
      labels.set(id, `Fileira ${rowIndex + 1} · direita · cadeira ${index + 1}`),
    );
  });
  return labels;
}

export function getSeatLabel(project: Project, seatId: string): string {
  for (let rowIndex = 0; rowIndex < project.layout.rows.length; rowIndex++) {
    const row = project.layout.rows[rowIndex]!;
    const leftIndex = row.leftSeatIds.indexOf(seatId);
    if (leftIndex >= 0) return `Fileira ${rowIndex + 1} · esquerda · cadeira ${leftIndex + 1}`;
    const rightIndex = row.rightSeatIds.indexOf(seatId);
    if (rightIndex >= 0) return `Fileira ${rowIndex + 1} · direita · cadeira ${rightIndex + 1}`;
  }
  throw new Error('Cadeira inexistente.');
}
export function getGuestSeatId(project: Project, guestId: string): string | undefined {
  if (!project.guests.some((guest) => guest.id === guestId))
    throw new Error('Convidado inexistente.');
  return project.assignments.find((assignment) => assignment.guestId === guestId)?.seatId;
}

/**
 * Projeção pública de um link de visualização (ADR-0014). Monta cada campo explicitamente, sem
 * espalhar o projeto: notas, IDs de convidados, título, `linkedCounts` e convidados sem lugar
 * nunca saem. No modo `plan` nenhum dado de convidado sai. A ordem segue a planta, não a lista.
 * A festa (`reception`) entra com salão, mesas e elementos; o convidado só aparece na mesa em que
 * está atribuído, e no modo `plan` só a contagem por mesa (ADR-0014).
 */
export function toSharedView(
  project: CeremonyProject & { reception?: Project['reception'] },
  mode: SharedView['mode'],
): SharedView {
  const { layout } = project;
  const seatOrder = layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]);
  const guestBySeat = new Map(
    project.assignments.map((assignment) => [assignment.seatId, assignment.guestId]),
  );
  const guests = new Map(project.guests.map((guest) => [guest.id, guest]));
  const base = {
    couple: { first: project.couple.first, second: project.couple.second },
    weddingDate: project.weddingDate,
    layout: {
      mode: layout.mode,
      curveStrength: layout.curveStrength,
      aisleWidth: layout.aisleWidth,
      rows: layout.rows.map((row) => ({
        id: row.id,
        leftSeatIds: [...row.leftSeatIds],
        rightSeatIds: [...row.rightSeatIds],
      })),
    },
  };
  const occupied = seatOrder.filter((seatId) => guestBySeat.has(seatId));
  const { reception } = project;
  const receptionBase = reception && {
    room: reception.room,
    tables: reception.tables,
    items: reception.items,
  };
  if (mode === 'plan') {
    const counts = new Map<string, number>();
    for (const { tableId } of reception?.tableAssignments ?? [])
      counts.set(tableId, (counts.get(tableId) ?? 0) + 1);
    return sharedViewSchema.parse({
      mode,
      ...base,
      occupiedSeatIds: occupied,
      reception: receptionBase && {
        ...receptionBase,
        tableCounts: reception.tables
          .filter((table) => counts.has(table.id))
          .map((table) => ({ tableId: table.id, occupied: counts.get(table.id)! })),
      },
    });
  }
  const seats = occupied.map((seatId) => {
    const guest = guests.get(guestBySeat.get(seatId)!);
    if (!guest) throw new Error('Convidado inexistente.');
    return { seatId, name: guest.name, category: guest.category };
  });
  const tableGuests = (reception?.tableAssignments ?? []).map(({ tableId, guestId }) => {
    const guest = guests.get(guestId);
    if (!guest) throw new Error('Convidado inexistente.');
    return { tableId, name: guest.name, category: guest.category };
  });
  const usedCategories = new Set([...seats, ...tableGuests].map((entry) => entry.category));
  const guestCategories = project.guestCategories
    .filter((category) => usedCategories.has(category.id))
    .map((category) => ({ ...category }));
  return sharedViewSchema.parse({
    mode,
    ...base,
    guestCategories,
    seats,
    reception: receptionBase && { ...receptionBase, guests: tableGuests },
  });
}
