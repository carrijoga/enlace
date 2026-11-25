import { projectSchema, type Project, type ReceptionItemKind } from '@enlace/contracts';
import { getDoorGeometry, getTableSeatPositions } from '@enlace/domain/reception';
import {
  PLACEHOLDER_TITLES,
  dateLabel,
  escapeXml,
  finite,
  fitText,
  plural,
  text,
} from './pure-svg.js';

const PAGE_WIDTH = 1600;
const PAGE_CENTER = PAGE_WIDTH / 2;
const CARD_INSET = 38;
const CONTENT = { x: 122, width: 1356 };
const MAP_TOP = 284;
const MAP_PADDING = 36;
const MAP_MAX_HEIGHT = 1100;
const ROOM_MARGIN_CM = 60;
const CHAIR_RADIUS_CM = 18;
const TEXT_MAX_WIDTH = 1300;
const DEFAULT_HEADLINE = 'Nossa festa';

const LIST = { columns: 3, gap: 24, padding: 22, title: 26, line: 26, name: 17 };

const STYLES = [
  "text{font-family:'Segoe UI',system-ui,sans-serif;text-anchor:middle}",
  '.serif,.table-title{font-family:Georgia,serif}',
  '.headline{fill:#253c2c;letter-spacing:-1px}',
  '.couple{fill:#a27646}',
  '.info{font-size:16px;letter-spacing:2.5px;fill:#6a756b}',
  '.summary{font-size:16px;font-weight:700;letter-spacing:2px;fill:#637264}',
  '.section{font-size:15px;font-weight:700;letter-spacing:2.5px;fill:#637264}',
  '.signature{font-style:italic;fill:#8a806f}',
  '.map-table{font-weight:700;fill:#253c2c}',
  '.map-count{fill:#637264}',
  '.map-item{fill:#485149}',
  '.table-title{font-weight:700;fill:#294d36;text-anchor:start}',
  '.table-count{font-size:14px;fill:#6a756b;text-anchor:end}',
  '.guest{fill:#2f3a32;text-anchor:start}',
  '.guest-empty{font-style:italic;fill:#97a394;text-anchor:start}',
].join('');

const KIND_STYLE: Record<ReceptionItemKind, { fill: string; stroke: string; dashed: boolean }> = {
  dance_floor: { fill: '#eef3e6', stroke: '#72977d', dashed: true },
  dj: { fill: '#dfe3da', stroke: '#626e63', dashed: false },
  cake_table: { fill: '#f3e6d3', stroke: '#b89364', dashed: false },
  sweets_table: { fill: '#f3e6d3', stroke: '#b89364', dashed: false },
  bar: { fill: '#dce8de', stroke: '#295842', dashed: false },
  buffet: { fill: '#e8e3d4', stroke: '#626e63', dashed: false },
  photo_area: { fill: '#f6efe3', stroke: '#b89364', dashed: true },
  custom: { fill: '#eceee8', stroke: '#626e63', dashed: false },
};

/** Texto livre em qualquer posição, com âncora e tamanho explícitos (coordenadas do salão). */
function label(x: number, y: number, value: string, className: string, size: number): string {
  return `<text x="${finite(x)}" y="${finite(y)}" class="${className}" font-size="${finite(size)}">${escapeXml(value)}</text>`;
}

/**
 * Cartão da planta da festa: o salão desenhado em escala, com mesas e elementos, e abaixo a lista
 * de convidados de cada mesa. Os nomes ficam na lista porque não cabem legíveis dentro das mesas.
 * Com `withNames: false`, sai só a planta, com a ocupação de cada mesa e sem nenhum nome.
 */
export function createReceptionSvg(
  projectInput: Project,
  { withNames = true }: { withNames?: boolean } = {},
): string {
  const project = projectSchema.parse(projectInput);
  const reception = project.reception;
  if (!reception) throw new Error('Monte a planta da festa antes de exportar.');
  const { room, tables, items, tableAssignments } = reception;
  const guestById = new Map(project.guests.map((guest) => [guest.id, guest]));
  const guestsByTable = new Map<string, string[]>(tables.map((table) => [table.id, []]));
  for (const assignment of tableAssignments) {
    const guest = guestById.get(assignment.guestId);
    if (guest) guestsByTable.get(assignment.tableId)?.push(guest.name.trim());
  }

  // Enquadramento: salão com margem, ampliado por qualquer elemento que saia dele.
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const include = (x: number, y: number, reach: number) => {
    left = Math.min(left, x - reach);
    right = Math.max(right, x + reach);
    top = Math.min(top, y - reach);
    bottom = Math.max(bottom, y + reach);
  };
  for (const point of room.outline) include(point.x, point.y, ROOM_MARGIN_CM);
  for (const table of tables)
    include(table.x, table.y, Math.hypot(table.width, table.depth) / 2 + 25 + CHAIR_RADIUS_CM);
  for (const item of items) include(item.x, item.y, Math.hypot(item.width, item.depth) / 2);
  for (const column of room.columns)
    include(column.x, column.y, Math.hypot(column.width, column.depth) / 2);
  const doorShapes = room.doors.flatMap((door) => {
    const geometry = getDoorGeometry(room.outline, door);
    if (!geometry) return [];
    const { start: a, end: b, along, inward } = geometry;
    const gap = `M${finite(a.x)} ${finite(a.y)}L${finite(b.x)} ${finite(b.y)}`;
    if (door.opening === 'sliding') {
      const panel = `M${finite(a.x + inward.x * 8)} ${finite(a.y + inward.y * 8)}L${finite(b.x + inward.x * 8)} ${finite(b.y + inward.y * 8)}`;
      return [{ gap, swing: '', panel }];
    }
    const side = door.opening === 'outward' ? -1 : 1;
    const nx = inward.x * side;
    const ny = inward.y * side;
    const leafX = a.x + nx * door.width;
    const leafY = a.y + ny * door.width;
    include(leafX, leafY, 0);
    include(b.x + nx * door.width, b.y + ny * door.width, 0);
    const sweep = nx * along.y - ny * along.x > 0 ? 1 : 0;
    const swing = `M${finite(a.x)} ${finite(a.y)}L${finite(leafX)} ${finite(leafY)}A${finite(door.width)} ${finite(door.width)} 0 0 ${sweep} ${finite(b.x)} ${finite(b.y)}`;
    return [{ gap, swing, panel: '' }];
  });

  const roomWidth = right - left;
  const roomHeight = bottom - top;
  const fit = Math.min(
    (CONTENT.width - MAP_PADDING * 2) / roomWidth,
    (MAP_MAX_HEIGHT - MAP_PADDING * 2) / roomHeight,
  );
  /** Converte pixels do cartão em centímetros do salão. */
  const px = (value: number) => value / fit;
  const frameHeight = roomHeight * fit + MAP_PADDING * 2;
  const mapX = PAGE_CENTER - (left + roomWidth / 2) * fit;
  const mapY = MAP_TOP + MAP_PADDING - top * fit;

  const outline = room.outline.map((point) => `${point.x},${point.y}`).join(' ');
  const wall = Math.max(px(3), 8);
  const doorsSvg = doorShapes
    .map(
      (door) =>
        `<path d="${door.gap}" stroke="#fffefb" stroke-width="${finite(wall + 4)}"/>${
          door.swing
            ? `<path d="${door.swing}" stroke="#b89364" stroke-width="${finite(px(1.5))}" stroke-dasharray="${finite(px(5))} ${finite(px(3))}"/>`
            : `<path d="${door.panel}" stroke="#b89364" stroke-width="${finite(px(3))}"/>`
        }<path d="${door.gap}" stroke="#b89364" stroke-width="${finite(wall / 2)}"/>`,
    )
    .join('');
  const columnsSvg = room.columns
    .map(
      (column) =>
        `<rect x="${finite(column.x - column.width / 2)}" y="${finite(column.y - column.depth / 2)}" width="${column.width}" height="${column.depth}" fill="#626e63" stroke="#27342c" stroke-width="${finite(px(1))}"/>`,
    )
    .join('');

  const mapText = (value: string, maxWidth: number, maxSize: number) =>
    fitText(value, maxWidth, px(maxSize), px(8));
  const itemsSvg = items
    .map((item) => {
      const style = KIND_STYLE[item.kind];
      const dash = style.dashed ? ` stroke-dasharray="${finite(px(8))} ${finite(px(5))}"` : '';
      const name = mapText(item.name, Math.max(item.width, item.depth) * 0.9, 14);
      return `<g transform="rotate(${item.rotation} ${item.x} ${item.y})"><rect x="${finite(item.x - item.width / 2)}" y="${finite(item.y - item.depth / 2)}" width="${item.width}" height="${item.depth}" rx="${finite(px(4))}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${finite(px(1.5))}"${dash}/></g>${label(item.x, item.y + name.size * 0.35, name.value, 'map-item', name.size)}`;
    })
    .join('');
  const tablesSvg = tables
    .map((table) => {
      const taken = guestsByTable.get(table.id)!.length;
      const chairs = getTableSeatPositions(table)
        .map(
          (chair, index) =>
            `<circle cx="${finite(chair.x)}" cy="${finite(chair.y)}" r="${CHAIR_RADIUS_CM}" fill="${index < taken ? '#72977d' : '#fffefb'}" stroke="#626e63" stroke-width="${finite(px(1))}"/>`,
        )
        .join('');
      const body =
        table.shape === 'round'
          ? `<circle cx="${table.x}" cy="${table.y}" r="${finite(table.width / 2)}" fill="#fffefb" stroke="#27342c" stroke-width="${finite(px(1.5))}"/>`
          : `<g transform="rotate(${table.rotation} ${table.x} ${table.y})"><rect x="${finite(table.x - table.width / 2)}" y="${finite(table.y - table.depth / 2)}" width="${table.width}" height="${table.depth}" rx="${finite(px(3))}" fill="#fffefb" stroke="#27342c" stroke-width="${finite(px(1.5))}"/></g>`;
      const inner = Math.min(table.width, table.depth) * 0.9;
      const name = mapText(table.name, Math.max(inner, table.width * 0.9), 15);
      const count = Math.min(name.size * 0.85, px(13));
      return `${chairs}${body}${label(table.x, table.y - name.size * 0.05, name.value, 'map-table', name.size)}${label(table.x, table.y + name.size * 0.95, `${taken}/${table.seats}`, 'map-count', count)}`;
    })
    .join('');

  const map = `<g transform="translate(${finite(mapX)} ${finite(mapY)}) scale(${finite(fit)})"><polygon points="${outline}" fill="#fffefb" stroke="#27342c" stroke-width="${finite(wall)}" stroke-linejoin="miter"/><g fill="none">${doorsSvg}</g>${columnsSvg}${itemsSvg}${tablesSvg}</g>`;

  // Lista de convidados por mesa, em colunas; cada linha da grade tem a altura do maior cartão.
  const columnWidth = (CONTENT.width - LIST.gap * (LIST.columns - 1)) / LIST.columns;
  const listTop = MAP_TOP + frameHeight + 52;
  const sectionTitle = text(PAGE_CENTER, listTop + 14, 'CONVIDADOS POR MESA', 'section');
  let rowTop = listTop + 44;
  const cards: string[] = [];
  for (let start = 0; withNames && start < tables.length; start += LIST.columns) {
    const row = tables.slice(start, start + LIST.columns);
    const rowHeight = Math.max(
      ...row.map(
        (table) =>
          LIST.padding * 2 +
          LIST.title +
          12 +
          Math.max(1, guestsByTable.get(table.id)!.length) * LIST.line,
      ),
    );
    row.forEach((table, position) => {
      const x = CONTENT.x + position * (columnWidth + LIST.gap);
      const textX = x + LIST.padding;
      const textWidth = columnWidth - LIST.padding * 2;
      const guests = guestsByTable.get(table.id)!;
      const countLabel = `${guests.length}/${table.seats}`;
      const title = fitText(table.name, textWidth - 70, 21, 14);
      const names = guests.length
        ? guests.map((name, index) => {
            const fitted = fitText(name, textWidth, LIST.name, 12);
            return text(
              textX,
              rowTop + LIST.padding + LIST.title + 12 + (index + 0.75) * LIST.line,
              fitted.value,
              'guest',
              fitted.size,
            );
          })
        : [
            text(
              textX,
              rowTop + LIST.padding + LIST.title + 12 + 0.75 * LIST.line,
              'Sem convidados',
              'guest-empty',
              LIST.name,
            ),
          ];
      cards.push(
        `<rect x="${finite(x)}" y="${finite(rowTop)}" width="${finite(columnWidth)}" height="${finite(rowHeight)}" rx="14" fill="#fffefb" stroke="#e1dcca" stroke-width="1.5"/>`,
        text(textX, rowTop + LIST.padding + 20, title.value, 'table-title', title.size),
        text(x + columnWidth - LIST.padding, rowTop + LIST.padding + 18, countLabel, 'table-count'),
        `<path d="M${finite(textX)} ${finite(rowTop + LIST.padding + LIST.title + 6)}H${finite(x + columnWidth - LIST.padding)}" stroke="#ece7d8"/>`,
        ...names,
      );
    });
    rowTop += rowHeight + LIST.gap;
  }
  const listBottom = !withNames
    ? MAP_TOP + frameHeight
    : tables.length
      ? rowTop - LIST.gap
      : listTop + 44;
  const list = !withNames
    ? ''
    : tables.length
      ? `${sectionTitle}${cards.join('')}`
      : text(PAGE_CENTER, listTop + 14, 'NENHUMA MESA NA PLANTA', 'section');

  const couple = [project.couple.first.trim(), project.couple.second.trim()]
    .filter(Boolean)
    .join(' & ');
  const info = [dateLabel(project.weddingDate), 'Planta da festa']
    .filter(Boolean)
    .join(' • ')
    .toLocaleUpperCase('pt-BR');
  const projectTitle = project.title.trim();
  const headline = PLACEHOLDER_TITLES.has(projectTitle.toLocaleLowerCase('pt-BR'))
    ? DEFAULT_HEADLINE
    : projectTitle;
  const fittedHeadline = fitText(headline, TEXT_MAX_WIDTH, 53, 26);
  const fittedCouple = couple ? fitText(couple, TEXT_MAX_WIDTH, 29, 16) : null;
  const header = [
    '<path d="M118 96H626M974 96H1482" stroke="#d5c6ac" stroke-width="2"/>',
    '<circle cx="788" cy="95" r="15" fill="none" stroke="#607862" stroke-width="2.5"/>',
    '<circle cx="812" cy="95" r="15" fill="none" stroke="#bb956a" stroke-width="2.5"/>',
    text(PAGE_CENTER, 158, fittedHeadline.value, 'serif headline', fittedHeadline.size),
    fittedCouple
      ? text(PAGE_CENTER, 212, fittedCouple.value, 'serif couple', fittedCouple.size)
      : '',
    text(PAGE_CENTER, fittedCouple ? 247 : 212, info, 'info'),
  ].join('');

  const seated = [...guestsByTable.values()].reduce((total, names) => total + names.length, 0);
  const seats = tables.reduce((total, table) => total + table.seats, 0);
  const summary = [
    plural(tables.length, 'mesa', 'mesas'),
    plural(seats, 'lugar', 'lugares'),
    plural(seated, 'convidado com mesa', 'convidados com mesa'),
  ]
    .join(' • ')
    .toLocaleUpperCase('pt-BR');
  const signature = couple ? fitText(couple, TEXT_MAX_WIDTH, 19, 13) : null;
  const footer = [
    `<path d="M125 ${finite(listBottom + 46)}H1475" stroke="#e1dcca" stroke-width="2"/>`,
    text(PAGE_CENTER, listBottom + 98, summary, 'summary'),
    signature
      ? text(PAGE_CENTER, listBottom + 152, signature.value, 'serif signature', signature.size)
      : '',
  ].join('');
  const cardBottom = listBottom + (signature ? 192 : 136);

  const height = Math.ceil(cardBottom + CARD_INSET);
  const labels = `<title>${escapeXml(project.title)}</title><desc>${withNames ? 'Planta da festa, com mesas e convidados de cada mesa.' : 'Planta da festa, com mesas e ocupação, sem nomes de convidados.'}</desc>`;
  const frames = `<rect width="${PAGE_WIDTH}" height="${height}" fill="#faf9f5"/><rect x="${CARD_INSET}" y="${CARD_INSET}" width="${PAGE_WIDTH - CARD_INSET * 2}" height="${finite(cardBottom - CARD_INSET)}" rx="18" fill="#fffefb" stroke="#deded2" stroke-width="2"/><rect x="${CONTENT.x}" y="${MAP_TOP}" width="${CONTENT.width}" height="${finite(frameHeight)}" rx="19" fill="#f4f5f0" stroke="#e8e8df" stroke-width="2"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${height}" viewBox="0 0 ${PAGE_WIDTH} ${height}" role="img">${labels}<style>${STYLES}</style>${frames}${header}${map}${list}${footer}</svg>`;
}
