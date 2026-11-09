import { EASE_OUT, prefersReducedMotion } from '../motion';

export type SeatPose = { x: number; y: number; angle: number; rowIndex: number };

/**
 * Acima deste total nada anima dentro da planta. Qualquer animação no SVG repinta todas as cadeiras
 * e legendas a cada quadro, na thread principal, e o orçamento de resposta do editor vale para o
 * cenário máximo (ADR-0011, docs/desempenho.md).
 */
export const SEAT_MOTION_LIMIT = 120;
const NEW_SEATS_LIMIT = 24;
const GLIDE_MS = 460;
const ROW_STAGGER_MS = 14;

/**
 * Deslocamento, no sistema local da posição final, que devolve a cadeira à posição inicial.
 * A animação é somada (`composite: 'add'`) ao `transform` do atributo, que já contém a pose final.
 */
export function offsetToPreviousPose(
  from: Pick<SeatPose, 'x' | 'y' | 'angle'>,
  to: Pick<SeatPose, 'x' | 'y' | 'angle'>,
) {
  const radians = (to.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos, angle: from.angle - to.angle };
}

function moved(offset: ReturnType<typeof offsetToPreviousPose>) {
  return Math.abs(offset.x) > 0.5 || Math.abs(offset.y) > 0.5 || Math.abs(offset.angle) > 0.5;
}

/**
 * Leva as cadeiras da pose anterior à nova. Por ser aditiva, uma troca no meio do caminho se soma
 * à anterior e o movimento continua sem salto.
 */
export function glideSeats(
  svg: SVGSVGElement,
  previous: ReadonlyMap<string, SeatPose>,
  next: ReadonlyMap<string, SeatPose>,
) {
  if (next.size > SEAT_MOTION_LIMIT || prefersReducedMotion()) return;
  const shared = [...next.keys()].filter((id) => previous.has(id)).length;
  const added = next.size - shared;
  // Outro planejamento (IDs novos) entra de uma vez: não há continuidade a explicar.
  if (!shared || added > NEW_SEATS_LIMIT) return;
  for (const element of svg.querySelectorAll<SVGGElement>('[data-seat-id]')) {
    const id = element.dataset.seatId!;
    const to = next.get(id);
    if (!to) continue;
    const from = previous.get(id);
    if (!from) {
      element.animate({ opacity: [0, 1] }, { duration: GLIDE_MS, easing: 'ease-out' });
      continue;
    }
    const offset = offsetToPreviousPose(from, to);
    if (!moved(offset)) continue;
    element.animate(
      {
        transform: [
          `translate(${offset.x}px, ${offset.y}px) rotate(${offset.angle}deg)`,
          'translate(0px, 0px) rotate(0deg)',
        ],
      },
      {
        duration: GLIDE_MS,
        delay: to.rowIndex * ROW_STAGGER_MS,
        easing: EASE_OUT,
        composite: 'add',
        fill: 'backwards',
      },
    );
  }
}

/** A cadeira recebe a pessoa: assenta e um aro dourado se abre. Toca só nesta cadeira. */
export function welcomeSeat(seat: SVGGElement, ring: SVGRectElement) {
  const reduced = prefersReducedMotion();
  ring.animate(
    {
      opacity: [0.95, 0],
      transform: reduced ? ['none', 'none'] : ['scale(0.82)', 'scale(1.32)'],
    },
    { duration: 560, easing: EASE_OUT },
  );
  if (reduced) return;
  seat.animate(
    { transform: ['scale(0.84)', 'scale(1.06)', 'scale(1)'], offset: [0, 0.55, 1] },
    { duration: 340, easing: 'ease-out', composite: 'add' },
  );
}
