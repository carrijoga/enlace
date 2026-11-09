import { ceremonyProjectSchema, type CeremonyProject } from '@enlace/contracts';
import { getLayoutGeometry, type LayoutGeometry, type SeatGeometry } from '@enlace/domain';
import { GUEST_CATEGORIES } from '../guest-categories.js';

const PAGE_WIDTH = 1600;
const PAGE_CENTER = PAGE_WIDTH / 2;
const CARD_INSET = 38;
const MAP_FRAME = { x: 122, y: 284, width: 1356, padding: 36 };
const MAP_MAX = { width: 1270, height: 1100, scale: 1.25 };
const TEXT_MAX_WIDTH = 1300;
const SEAT_GUIDE_OFFSET = 38;

/** Títulos automáticos não dizem nada no impresso: usam a frase do cartão. */
const PLACEHOLDER_TITLES = new Set(['minha cerimônia', 'meu projeto', 'cerimônia de exemplo']);
const DEFAULT_HEADLINE = 'Nosso lugar no sim';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const STYLES = [
  "text{font-family:'Segoe UI',system-ui,sans-serif;text-anchor:middle}",
  '.serif,.chair-name,.chair-seat,.chair-empty,.altar,.aisle,.side,.entry{font-family:Georgia,serif}',
  '.headline{fill:#253c2c;letter-spacing:-1px}',
  '.couple{fill:#a27646}',
  '.info{font-size:16px;letter-spacing:2.5px;fill:#6a756b}',
  '.summary{font-size:16px;font-weight:700;letter-spacing:2px;fill:#637264}',
  '.orientation{font-size:16px;fill:#6b756b}',
  '.signature{font-style:italic;fill:#8a806f}',
  '.notice{font-size:17px;font-weight:700;fill:#325641}',
  '.seat-name{font-size:21px;font-weight:700;fill:#294d36}',
  '.altar{font-size:13px;font-weight:700;letter-spacing:2px;fill:#597262}',
  '.aisle{font-size:11px;letter-spacing:2px;fill:#8f9686}',
  '.side{font-size:11px;letter-spacing:1.2px;fill:#7c877a}',
  '.entry{font-size:11px;letter-spacing:1px;fill:#849082}',
  '.chair-name{font-weight:700}',
  '.chair-seat{font-size:8px;opacity:.75}',
  '.chair-empty{font-size:11px;font-style:italic;fill:#97a394}',
].join('');

type ChairColors = { fill: string; stroke: string; rule: string };

const EMPTY_CHAIR: ChairColors = { fill: '#fffefb', stroke: '#c9d2c6', rule: '#d7dcd3' };
const HIGHLIGHTED_CHAIR: ChairColors = { fill: '#f2ead8', stroke: '#b7893f', rule: '#c8ae79' };

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character]!;
  });

const finite = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error('Geometria de planta inválida.');
  return String(Math.round(value * 1000) / 1000);
};

const glyphWidth = (character: string): number => {
  // Larguras em em, calibradas pela Georgia em negrito (a mais larga usada no cartão).
  if (/[iljtfI.,'’·\s]/.test(character)) return 0.36;
  if (/[mwMW@]/.test(character)) return 1;
  if (/[A-ZÀ-Ý]/.test(character)) return 0.78;
  return 0.62;
};

const estimatedWidth = (value: string, size: number): number =>
  [...value].reduce((total, character) => total + glyphWidth(character), 0) * size;

/** Reduz a fonte até caber; abaixo do mínimo, corta com reticências. Nunca deforma as letras. */
function fitText(
  value: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): { value: string; size: number } {
  const width = estimatedWidth(value, maxSize);
  if (width <= maxWidth) return { value, size: maxSize };
  const size = (maxSize * maxWidth) / width;
  if (size >= minSize) return { value, size: Math.floor(size * 10) / 10 };
  const characters = [...value];
  while (characters.length > 1 && estimatedWidth(`${characters.join('')}…`, minSize) > maxWidth)
    characters.pop();
  return { value: `${characters.join('').trimEnd()}…`, size: minSize };
}

function text(x: number, y: number, value: string, className: string, size?: number): string {
  const fontSize = size === undefined ? '' : ` font-size="${finite(size)}"`;
  return `<text x="${finite(x)}" y="${finite(y)}" class="${className}"${fontSize}>${escapeXml(value)}</text>`;
}

function fittedText(
  y: number,
  value: string,
  className: string,
  maxSize: number,
  minSize: number,
): string {
  const fitted = fitText(value, TEXT_MAX_WIDTH, maxSize, minSize);
  return text(PAGE_CENTER, y, fitted.value, className, fitted.size);
}

function dateLabel(date: string | null): string {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return `${day} de ${MONTHS[month! - 1]} de ${year}`;
}

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count === 1 ? singular : pluralForm}`;

const aisleLabel = (width: number): string =>
  `${width.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} m`;

const firstName = (name: string): string => name.trim().split(/\s+/)[0]!;

/** Primeiro nome na cadeira; pessoas homônimas ganham a inicial do sobrenome para não se confundirem. */
function chairNames(project: CeremonyProject): Map<string, string> {
  const seated = new Set(project.assignments.map((assignment) => assignment.guestId));
  const guests = project.guests.filter((guest) => seated.has(guest.id));
  const repeated = new Map<string, number>();
  for (const guest of guests) {
    const key = firstName(guest.name).toLocaleLowerCase('pt-BR');
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }
  return new Map(
    guests.map((guest) => {
      const parts = guest.name.trim().split(/\s+/);
      const first = parts[0]!;
      const isRepeated = repeated.get(first.toLocaleLowerCase('pt-BR'))! > 1;
      return [guest.id, isRepeated && parts.length > 1 ? `${first} ${parts.at(-1)![0]}.` : first];
    }),
  );
}

function chair(colors: ChairColors, content: string, ring = ''): string {
  return `${ring}<rect x="-25" y="-27" width="50" height="9" rx="3" fill="${colors.stroke}"/><rect x="-25" y="-19" width="50" height="51" rx="8" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"/><path d="M-23 22H23" stroke="${colors.rule}"/>${content}`;
}

function chairLabels(name: string, seat: SeatGeometry, color: string): string {
  const fitted = fitText(name, 45, 11.5, 6.7);
  const seatNumber = `${seat.rowIndex + 1} · ${seat.index + 1}`;
  return `<text x="0" y="3" class="chair-name" font-size="${finite(fitted.size)}" fill="${color}">${escapeXml(fitted.value)}</text><text x="0" y="17" class="chair-seat" fill="${color}">${seatNumber}</text>`;
}

const placeSeat = (seat: SeatGeometry, content: string, attributes = ''): string =>
  `<g transform="translate(${finite(seat.x)} ${finite(seat.y)}) rotate(${finite(seat.angle)})"${attributes}>${content}</g>`;

function arch(center: number): string {
  const dots = Array.from({ length: 9 }, (_, index) => {
    const angle = Math.PI + (index / 8) * Math.PI;
    const color = index % 3 ? '#829c7c' : '#d0b58d';
    return `<circle cx="${finite(center + 129 * Math.cos(angle))}" cy="${finite(171 + 113 * Math.sin(angle))}" r="${index % 2 ? 3.1 : 4.2}" fill="${color}"/>`;
  }).join('');
  return `<path d="M${finite(center - 129)} 171A129 113 0 0 1 ${finite(center + 129)} 171" fill="none" stroke="#a1a98c" stroke-width="2"/><path d="M${finite(center - 116)} 172A116 100 0 0 1 ${finite(center + 116)} 172" fill="none" stroke="#e2e5d5" stroke-width="1.5"/>${dots}<rect x="${finite(center - 48)}" y="170" width="96" height="28" rx="9" fill="#e5eadd"/>${text(center, 189, 'ALTAR', 'altar')}`;
}

/** Curva pontilhada sob cada fileira; cada trecho é exato porque a rotação da cadeira é a tangente. */
function rowGuides(geometry: LayoutGeometry, mode: CeremonyProject['layout']['mode']): string {
  if (mode !== 'curve') return '';
  const lines = new Map<string, SeatGeometry[]>();
  for (const seat of geometry.seats) {
    const key = `${seat.rowIndex}:${seat.side}`;
    lines.set(key, [...(lines.get(key) ?? []), seat]);
  }
  const paths = [...lines.values()]
    .filter((seats) => seats.length > 1)
    .map((seats) => {
      const start = seats[0]!;
      const curve = seats.slice(1).map((seat, position) => {
        const previous = seats[position]!;
        const controlX = (previous.x + seat.x) / 2;
        const slope = Math.tan((previous.angle * Math.PI) / 180);
        const controlY = previous.y + SEAT_GUIDE_OFFSET + (slope * (seat.x - previous.x)) / 2;
        return `Q${finite(controlX)} ${finite(controlY)} ${finite(seat.x)} ${finite(seat.y + SEAT_GUIDE_OFFSET)}`;
      });
      return `M${finite(start.x)} ${finite(start.y + SEAT_GUIDE_OFFSET)}${curve.join('')}`;
    });
  return paths.length
    ? `<path d="${paths.join('')}" fill="none" stroke="#dde3d8" stroke-width="1.4" stroke-dasharray="3 8"/>`
    : '';
}

/** Rótulo sobre a primeira fileira com cadeiras daquele lado, acima da cadeira mais alta. */
function sideLabel(geometry: LayoutGeometry, side: SeatGeometry['side'], label: string) {
  const onSide = geometry.seats.filter((seat) => seat.side === side);
  if (!onSide.length) return null;
  const firstRow = Math.min(...onSide.map((seat) => seat.rowIndex));
  const row = onSide.filter((seat) => seat.rowIndex === firstRow);
  const x = row.reduce((total, seat) => total + seat.x, 0) / row.length;
  const y = Math.min(...row.map((seat) => seat.y)) - 44;
  return { y, svg: text(x, y, label, 'side') };
}

export function createMapSvg(projectInput: CeremonyProject, personalGuestId?: string): string {
  const project = ceremonyProjectSchema.parse(projectInput);
  const geometry = getLayoutGeometry(project.layout);
  const guestById = new Map(project.guests.map((guest) => [guest.id, guest]));
  const assignmentBySeat = new Map(
    project.assignments.map((assignment) => [assignment.seatId, assignment]),
  );
  const personalGuest = personalGuestId ? guestById.get(personalGuestId) : undefined;
  if (personalGuestId && !personalGuest) throw new Error('Convidado não encontrado.');
  const personalAssignment = personalGuestId
    ? project.assignments.find((assignment) => assignment.guestId === personalGuestId)
    : undefined;
  if (personalGuestId && !personalAssignment)
    throw new Error('O convidado não tem cadeira atribuída nesta planta.');
  const personalSeat = personalAssignment
    ? geometry.seats.find((seat) => seat.id === personalAssignment.seatId)
    : undefined;
  if (personalAssignment && !personalSeat)
    throw new Error('A cadeira atribuída não existe na geometria.');

  const { center, corridorHalf, seats } = geometry;
  const lowestSeat = Math.max(318, ...seats.map((seat) => seat.y));
  const left = sideLabel(geometry, 'left', 'ESQUERDA');
  const right = sideLabel(geometry, 'right', 'DIREITA');

  // Enquadra só o conteúdo desenhado: plantas pequenas não ficam perdidas na moldura.
  const cropTop = Math.min(44, ...[left, right].flatMap((label) => (label ? [label.y - 16] : [])));
  const cropBottom = lowestSeat + 84;
  const halfWidth = Math.max(190, ...seats.map((seat) => Math.abs(seat.x - center) + 60));
  const fit = Math.min(
    MAP_MAX.scale,
    MAP_MAX.width / (halfWidth * 2),
    MAP_MAX.height / (cropBottom - cropTop),
  );
  const frameHeight = (cropBottom - cropTop) * fit + MAP_FRAME.padding * 2;
  const frameBottom = MAP_FRAME.y + frameHeight;
  const mapX = PAGE_CENTER - center * fit;
  const mapY = MAP_FRAME.y + MAP_FRAME.padding - cropTop * fit;

  const names = personalGuest ? new Map<string, string>() : chairNames(project);
  const seatsSvg = seats
    .map((seat) => {
      if (personalGuest) {
        if (seat.id !== personalSeat!.id)
          return placeSeat(seat, chair(EMPTY_CHAIR, ''), ' opacity=".42"');
        const ring =
          '<rect x="-39" y="-46" width="78" height="96" rx="17" fill="#f9e7bd" fill-opacity=".55" stroke="#b7893f" stroke-width="5"/>';
        return placeSeat(
          seat,
          chair(
            HIGHLIGHTED_CHAIR,
            chairLabels(firstName(personalGuest.name), seat, '#5e4b27'),
            ring,
          ),
        );
      }
      const assignment = assignmentBySeat.get(seat.id);
      const guest = assignment ? guestById.get(assignment.guestId) : undefined;
      if (!guest) {
        const number = String(seat.index + 1).padStart(2, '0');
        return placeSeat(
          seat,
          chair(EMPTY_CHAIR, `<text x="0" y="5" class="chair-empty">${number}</text>`),
        );
      }
      const category = GUEST_CATEGORIES[guest.category];
      return placeSeat(
        seat,
        `<title>${escapeXml(guest.name)}</title>${chair(
          { fill: category.fill, stroke: category.stroke, rule: category.stroke },
          chairLabels(names.get(guest.id) ?? firstName(guest.name), seat, category.text),
        )}`,
      );
    })
    .join('');

  const aisle = aisleLabel(project.layout.aisleWidth);
  const corridor = `<path d="M${finite(center - corridorHalf)} 218V${finite(lowestSeat + 56)}M${finite(center + corridorHalf)} 218V${finite(lowestSeat + 56)}" fill="none" stroke="#e1e2d4" stroke-width="2" stroke-dasharray="7 10"/>${text(center, 237, 'CORREDOR', 'aisle')}${text(center, 253, aisle, 'aisle')}`;
  const map = `<g transform="translate(${finite(mapX)} ${finite(mapY)}) scale(${finite(fit)})">${arch(center)}${corridor}${left?.svg ?? ''}${right?.svg ?? ''}${rowGuides(geometry, project.layout.mode)}${seatsSvg}${text(center, lowestSeat + 78, 'ENTRADA', 'entry')}</g>`;

  const couple = [project.couple.first.trim(), project.couple.second.trim()]
    .filter(Boolean)
    .join(' & ');
  const mode = project.layout.mode === 'curve' ? 'Cerimônia em meia-lua' : 'Cerimônia tradicional';
  const info = [dateLabel(project.weddingDate), mode]
    .filter(Boolean)
    .join(' • ')
    .toLocaleUpperCase('pt-BR');
  const projectTitle = project.title.trim();
  const headline = personalGuest
    ? 'Seu lugar na cerimônia'
    : PLACEHOLDER_TITLES.has(projectTitle.toLocaleLowerCase('pt-BR'))
      ? DEFAULT_HEADLINE
      : projectTitle;
  const subtitle = personalGuest ? personalGuest.name : couple;

  const header = [
    '<path d="M118 96H626M974 96H1482" stroke="#d5c6ac" stroke-width="2"/>',
    '<circle cx="788" cy="95" r="15" fill="none" stroke="#607862" stroke-width="2.5"/>',
    '<circle cx="812" cy="95" r="15" fill="none" stroke="#bb956a" stroke-width="2.5"/>',
    fittedText(158, headline, 'serif headline', 53, 26),
    subtitle ? fittedText(212, subtitle, 'serif couple', 29, 16) : '',
    text(PAGE_CENTER, subtitle ? 247 : 212, info, 'info'),
  ].join('');

  let footer: string;
  let cardBottom: number;
  if (personalSeat) {
    const noticeTop = frameBottom + 36;
    footer = [
      `<rect x="340" y="${finite(noticeTop)}" width="920" height="76" rx="15" fill="#e9f2e6" stroke="#c3d6be"/>`,
      text(PAGE_CENTER, noticeTop + 30, 'SUA CADEIRA ESTÁ DESTACADA EM DOURADO', 'notice'),
      text(PAGE_CENTER, noticeTop + 60, personalSeat.label, 'seat-name'),
      text(
        PAGE_CENTER,
        noticeTop + 118,
        'Orientação: da entrada, olhando em direção ao altar',
        'orientation',
      ),
      couple ? fittedText(noticeTop + 174, couple, 'serif signature', 19, 13) : '',
    ].join('');
    cardBottom = noticeTop + (couple ? 214 : 156);
  } else {
    const counts = [
      plural(project.layout.rows.length, 'fileira', 'fileiras'),
      plural(seats.length, 'cadeira', 'cadeiras'),
      'corredor de',
    ]
      .join(' • ')
      .toLocaleUpperCase('pt-BR');
    footer = [
      `<path d="M125 ${finite(frameBottom + 46)}H1475" stroke="#e1dcca" stroke-width="2"/>`,
      text(PAGE_CENTER, frameBottom + 98, `${counts} ${aisle}`, 'summary'),
      text(
        PAGE_CENTER,
        frameBottom + 136,
        'Visão de quem entra, olhando em direção ao altar',
        'orientation',
      ),
      couple ? fittedText(frameBottom + 192, couple, 'serif signature', 19, 13) : '',
    ].join('');
    cardBottom = frameBottom + (couple ? 232 : 176);
  }

  const height = Math.ceil(cardBottom + CARD_INSET);
  const svgTitle = personalGuest ? 'Planta individual' : escapeXml(project.title);
  const labels = `<title>${svgTitle}</title><desc>Mapa da cerimônia, com altar e corredor central.</desc>`;
  const frames = `<rect width="${PAGE_WIDTH}" height="${height}" fill="#faf9f5"/><rect x="${CARD_INSET}" y="${CARD_INSET}" width="${PAGE_WIDTH - CARD_INSET * 2}" height="${finite(cardBottom - CARD_INSET)}" rx="18" fill="#fffefb" stroke="#deded2" stroke-width="2"/><rect x="${MAP_FRAME.x}" y="${MAP_FRAME.y}" width="${MAP_FRAME.width}" height="${finite(frameHeight)}" rx="19" fill="#fffefb" stroke="#e8e8df" stroke-width="2"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${height}" viewBox="0 0 ${PAGE_WIDTH} ${height}" role="img">${labels}<style>${STYLES}</style>${frames}${header}${map}${footer}</svg>`;
}
