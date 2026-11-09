import { describe, expect, it } from 'vitest';
import { offsetToPreviousPose } from './plan-motion';

/** Reaplica o deslocamento local sobre a pose final, como o navegador faz ao somar a animação. */
function replay(
  to: { x: number; y: number; angle: number },
  offset: ReturnType<typeof offsetToPreviousPose>,
) {
  const radians = (to.angle * Math.PI) / 180;
  return {
    x: to.x + offset.x * Math.cos(radians) - offset.y * Math.sin(radians),
    y: to.y + offset.x * Math.sin(radians) + offset.y * Math.cos(radians),
    angle: to.angle + offset.angle,
  };
}

describe('offsetToPreviousPose', () => {
  it('é a diferença simples quando a pose final não está girada', () => {
    expect(offsetToPreviousPose({ x: 10, y: 20, angle: 15 }, { x: 4, y: 8, angle: 0 })).toEqual({
      x: 6,
      y: 12,
      angle: 15,
    });
  });

  it('retorna exatamente à pose anterior a partir de uma pose final girada', () => {
    const from = { x: 120.5, y: 310.25, angle: -8 };
    const to = { x: 96, y: 342, angle: 27.5 };
    const back = replay(to, offsetToPreviousPose(from, to));
    expect(back.x).toBeCloseTo(from.x, 8);
    expect(back.y).toBeCloseTo(from.y, 8);
    expect(back.angle).toBeCloseTo(from.angle, 8);
  });
});
