import { describe, expect, it } from 'vitest';
import { createDemoDocument } from '@enlace/contracts';
import { createMapSvg } from './pure-svg.js';

function projectWithGuest() {
  const project = createDemoDocument().project;
  const seatId = project.layout.rows[0]!.leftSeatIds[0]!;
  const guest = {
    id: 'c9dcb9e5-1897-4da2-a804-00be303a0288',
    name: '<script>&"\'Jo</script>',
    category: 'familia' as const,
    note: 'segredo-nota',
  };
  return {
    ...project,
    title: 'Cerimônia & <festa>',
    couple: { first: 'A&B', second: 'Noivo' },
    weddingDate: '2027-06-12',
    guests: [guest],
    assignments: [{ seatId, guestId: guest.id }],
  };
}

describe('SVG puro da planta', () => {
  it('escapa metadados e nomes maliciosos sem interpretar markup', () => {
    const svg = createMapSvg(projectWithGuest());
    expect(svg).toContain('Cerimônia &amp; &lt;festa&gt;');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;Jo&lt;/script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('2027-06-12');
    expect(svg).toContain('ALTAR');
    expect(svg).toContain('ENTRADA');
    expect(svg).toContain('width="50" height="51" rx="8"');
  });

  it('oculta no mapa individual dados dos outros convidados e mantém limites finitos', () => {
    const project = projectWithGuest();
    const second = {
      id: '20c7ed66-8fca-48f4-a595-e2441f2fe1d7',
      name: 'OutroNome',
      category: 'padrinho' as const,
      note: 'OutraNota',
    };
    const withTwo = {
      ...project,
      guests: [...project.guests, second],
      assignments: [
        ...project.assignments,
        { seatId: project.layout.rows[0]!.rightSeatIds[0]!, guestId: second.id },
      ],
    };
    const svg = createMapSvg(withTwo, project.guests[0]!.id);
    expect(svg).toContain(
      project.guests[0]!.name.replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;'),
    );
    expect(svg.toLowerCase()).not.toContain('outronome');
    expect(svg).not.toContain('OutraNota');
    expect(svg).not.toContain(second.id);
    expect(svg).not.toContain('padrinho');
    expect(svg).not.toContain('A&amp;B');
    expect(svg).toContain('x="0" y="-36"');
    expect(svg).toContain('x="0" y="39"');
    expect(svg).toContain('Fileira 1 · esquerda · cadeira 1');
    expect(svg).toContain('stroke="#c8ae79"');
    expect(svg).toContain('path d="M25,-32 l7,7');
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(viewBox).not.toBeNull();
    expect(Number.isFinite(Number(viewBox![1])) && Number.isFinite(Number(viewBox![2]))).toBe(true);
    const numericAttributes = [
      ...svg.matchAll(/(?:width|height|x|y|cx|cy|r|rotate)="(-?\d+(?:\.\d+)?)"/g),
    ];
    expect(numericAttributes.length).toBeGreaterThan(0);
    expect(numericAttributes.every((match) => Number.isFinite(Number(match[1])))).toBe(true);
    const transforms = [...svg.matchAll(/translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\)/g)];
    expect(transforms).toHaveLength(55);
    expect(
      transforms
        .flatMap((match) => match.slice(1))
        .every((value) => Number.isFinite(Number(value))),
    ).toBe(true);
  });

  it('recusa convidado inexistente ou sem cadeira', () => {
    const project = projectWithGuest();
    expect(() => createMapSvg(project, '20c7ed66-8fca-48f4-a595-e2441f2fe1d7')).toThrow(
      'não encontrado',
    );
    expect(() => createMapSvg({ ...project, assignments: [] }, project.guests[0]!.id)).toThrow(
      'não tem cadeira',
    );
  });
});
