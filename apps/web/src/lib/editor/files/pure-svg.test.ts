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
    expect(svg).toContain('12 DE JUNHO DE 2027');
    expect(svg).toContain('CERIMÔNIA TRADICIONAL');
    expect(svg).toContain('ALTAR');
    expect(svg).toContain('ENTRADA');
    expect(svg).toContain('5 FILEIRAS • 55 CADEIRAS • CORREDOR DE 1,8 m');
    expect(svg).toContain('width="50" height="51" rx="8"');
  });

  it('usa a frase do cartão quando o título é automático e o título real quando existe', () => {
    const project = projectWithGuest();
    expect(createMapSvg({ ...project, title: 'Minha cerimônia' })).toContain('Nosso lugar no sim');
    expect(createMapSvg(project)).not.toContain('Nosso lugar no sim');
  });

  it('não deforma nomes e encurta o que não cabe na cadeira', () => {
    const project = projectWithGuest();
    const guest = project.guests[0]!;
    const named = (name: string) => createMapSvg({ ...project, guests: [{ ...guest, name }] });
    expect(named('Cidinha Souza')).not.toContain('textLength');
    expect(named('Cidinha Souza')).toContain('>Cidinha</text>');
    expect(named('Maximilianowsky Souza')).toMatch(/class="chair-name"[^>]*>Maximil[^<]*…<\/text>/);
  });

  it('diferencia homônimos pela inicial do sobrenome', () => {
    const project = projectWithGuest();
    const seatIds = project.layout.rows[0]!.leftSeatIds;
    const guests = [
      {
        id: 'c9dcb9e5-1897-4da2-a804-00be303a0288',
        name: 'Ana Prado',
        category: 'familia' as const,
        note: '',
      },
      {
        id: '20c7ed66-8fca-48f4-a595-e2441f2fe1d7',
        name: 'Ana Lima',
        category: 'familia' as const,
        note: '',
      },
    ];
    const svg = createMapSvg({
      ...project,
      guests,
      assignments: guests.map((guest, index) => ({ seatId: seatIds[index]!, guestId: guest.id })),
    });
    expect(svg).toContain('>Ana P.</text>');
    expect(svg).toContain('>Ana L.</text>');
  });

  it('desenha guias de fileira só na meia-lua', () => {
    const project = projectWithGuest();
    const curved = { ...project, layout: { ...project.layout, mode: 'curve' as const } };
    expect(createMapSvg(curved)).toContain('stroke-dasharray="3 8"');
    expect(createMapSvg(project)).not.toContain('stroke-dasharray="3 8"');
    expect(createMapSvg(curved)).toContain('CERIMÔNIA EM MEIA-LUA');
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
    expect(svg).toContain('A&amp;B &amp; Noivo');
    expect(svg).toContain('12 DE JUNHO DE 2027');
    expect(svg).not.toContain('Cerimônia &amp; &lt;festa&gt;');
    expect(svg).not.toContain('chair-empty">');
    expect(svg).toContain('Seu lugar na cerimônia');
    expect(svg).toContain('Fileira 1 · esquerda · cadeira 1');
    expect(svg.match(/stroke="#b7893f" stroke-width="5"/g)).toHaveLength(1);
    expect(svg.match(/opacity="\.42"/g)).toHaveLength(54);
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
