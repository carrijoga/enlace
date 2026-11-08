import { ceremonyProjectSchema, type CeremonyProject } from '@enlace/contracts';
import { getLayoutGeometry } from '@enlace/domain';
import { GUEST_CATEGORIES } from '../guest-categories.js';

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

const displayName = (name: string): string => (name.length > 22 ? `${name.slice(0, 21)}…` : name);

function chairName(name: string, color: string): string {
  const parts = name.trim().split(/\s+/);
  const lines = [parts[0]!, ...(parts.length > 1 ? [parts.at(-1)!] : [])];
  return lines
    .map((part, index) => {
      const short = part.length > 9 ? `${part.slice(0, 8)}…` : part;
      return `<text x="0" y="${index === 0 ? 0 : 13}" text-anchor="middle" class="chair-name" fill="${color}"${short.length > 6 ? ' textLength="44" lengthAdjust="spacingAndGlyphs"' : ''}>${escapeXml(short)}</text>`;
    })
    .join('');
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

  const margin = 48;
  const scale = 1;
  const width = geometry.width * scale + margin * 2;
  const height = geometry.height * scale + margin * 2;
  const centerX = margin + geometry.center * scale;
  const aisleHalf = geometry.corridorHalf * scale;
  const isPersonal = Boolean(personalGuestId);

  const seats = geometry.seats
    .map((seat) => {
      const x = margin + seat.x * scale;
      const y = margin + seat.y * scale;
      const assignment = assignmentBySeat.get(seat.id);
      const guest = assignment ? guestById.get(assignment.guestId) : undefined;
      const selected = personalSeat?.id === seat.id;
      const category = guest ? GUEST_CATEGORIES[guest.category] : undefined;
      const fill = isPersonal ? (selected ? '#f2ead8' : '#eeefeb') : (category?.fill ?? '#eeefeb');
      const stroke = isPersonal
        ? selected
          ? '#c8ae79'
          : '#b9beb5'
        : (category?.stroke ?? '#b9beb5');
      const textColor = isPersonal ? '#485149' : (category?.text ?? '#485149');
      const label = isPersonal
        ? selected
          ? `<text x="0" y="-36" text-anchor="middle" class="name" fill="#294b32">${escapeXml(displayName(personalGuest!.name))}</text><text x="0" y="39" text-anchor="middle" class="seat-label">${escapeXml(seat.label)}</text>`
          : ''
        : guest
          ? `<title>${escapeXml(guest.name)}</title>${chairName(guest.name, textColor)}`
          : '';
      const marker = selected
        ? '<rect x="-30" y="-30" width="60" height="61" rx="12" fill="none" stroke="#c8ae79" stroke-width="4"/><path d="M25,-32 l7,7 -7,7 -7,-7 z" fill="#c8ae79" stroke="#5e4b27" stroke-width="1"/>'
        : '';
      return `<g transform="translate(${finite(x)} ${finite(y)}) rotate(${finite(seat.angle)})"><title>${escapeXml(seat.label)}</title>${marker}<rect x="-25" y="-25" width="50" height="51" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/><rect x="-25" y="-25" width="50" height="9" rx="8" fill="${stroke}"/>${label}</g>`;
    })
    .join('');

  const title = personalGuestId ? 'Planta individual' : escapeXml(project.title);
  const couple = personalGuestId
    ? ''
    : `<text x="${finite(centerX)}" y="${finite(margin + 23)}" text-anchor="middle" class="couple">${escapeXml([project.couple.first, project.couple.second].filter(Boolean).join(' & '))}</text>`;
  const date =
    personalGuestId || !project.weddingDate
      ? ''
      : `<text x="${finite(centerX)}" y="${finite(margin + 43)}" text-anchor="middle" class="date">${escapeXml(project.weddingDate)}</text>`;
  const altar = `<rect x="${finite(centerX - 80)}" y="${finite(margin + 170)}" width="160" height="32" rx="7" fill="#e8f0e7" stroke="#8ca98c" stroke-width="2"/><text x="${finite(centerX)}" y="${finite(margin + 191)}" text-anchor="middle" class="altar">ALTAR</text>`;
  const corridor = `<rect x="${finite(centerX - aisleHalf)}" y="${finite(margin + 202)}" width="${finite(aisleHalf * 2)}" height="${finite(Math.max(0, (geometry.height - 202) * scale))}" fill="#f2eee7"/>`;
  const entry = `<text x="${finite(centerX)}" y="${finite(height - 12)}" text-anchor="middle" class="entry">ENTRADA</text>`;
  const labels = `<title>${title}</title><desc>Mapa da cerimônia, com altar e corredor central.</desc>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${finite(width)}" height="${finite(height)}" viewBox="0 0 ${finite(width)} ${finite(height)}" role="img">${labels}<style>text{font-family:Arial,sans-serif}.couple{font-size:18px;font-weight:700;fill:#294b32}.date,.entry{font-size:12px;letter-spacing:1px;fill:#5e625b}.altar{font-size:12px;fill:#294b32;font-weight:700}.name{font-size:13px;font-weight:600}.chair-name{font-size:9px;font-weight:600}.seat-label{font-size:11px;fill:#5e4b27;font-weight:600}</style><rect width="100%" height="100%" fill="#fbfaf7"/>${couple}${date}${corridor}${altar}${seats}${entry}</svg>`;
}
