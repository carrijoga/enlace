// Benchmark sintético do editor local (fase 2). Executar no console da rota /editor do
// build de produção. Não usa dados pessoais: gera 288 cadeiras e 300 convidados fictícios.
//
// Uso: `await enlaceBench.seed('max')`, recarregar a página, depois `await enlaceBench.run()`.
// Mede do início da ação até o primeiro quadro seguinte ter sido produzido (rAF seguido de
// uma tarefa via MessageChannel, que roda depois da pintura). Não é INP de campo.
(() => {
  const uuid = () => crypto.randomUUID();
  const categories = ['familia', 'padrinho', 'madrinha', 'pajem', 'convidado'];

  function project(kind) {
    const rows =
      kind === 'max'
        ? Array.from({ length: 12 }, () => [12, 12])
        : [
            [6, 5],
            [5, 6],
            [6, 5],
            [5, 6],
            [6, 5],
          ];
    const layoutRows = rows.map(([l, r]) => ({
      id: uuid(),
      leftSeatIds: Array.from({ length: l }, uuid),
      rightSeatIds: Array.from({ length: r }, uuid),
    }));
    const guestCount = kind === 'max' ? 300 : 10;
    const guests = Array.from({ length: guestCount }, (_, i) => ({
      id: uuid(),
      name: `Pessoa fictícia ${String(i + 1).padStart(3, '0')} de Araújo e Nascimento`,
      category: categories[i % 5],
      note: '',
    }));
    const seats = layoutRows.flatMap((r) => [...r.leftSeatIds, ...r.rightSeatIds]);
    return {
      title: kind === 'max' ? 'Ensaio sintético — 288 cadeiras' : 'Ensaio sintético — comum',
      couple: { first: 'Alex', second: 'Ravi' },
      weddingDate: null,
      layout: {
        mode: 'straight',
        curveStrength: 50,
        aisleWidth: 1.8,
        linkedCounts: true,
        rows: layoutRows,
      },
      guests,
      assignments: seats
        .slice(0, Math.min(seats.length, guests.length))
        .map((seatId, i) => ({ seatId, guestId: guests[i].id })),
    };
  }

  // Modo 'layout': quando a aba não está visível o navegador não entrega quadros (rAF). Nesse
  // caso mede até o Svelte aplicar o DOM e o estilo/layout forçado; exclui pintura/composição.
  let mode = 'frame';
  const frame = () =>
    mode === 'layout'
      ? new Promise((resolve) => {
          // MessageChannel não sofre o atraso de timers em abas ocultas.
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            document.body.getBoundingClientRect();
            resolve();
          };
          channel.port2.postMessage(0);
        })
      : rafFrame();
  const rafFrame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(0);
      }),
    );
  const idle = () => new Promise((resolve) => setTimeout(resolve, 60));
  const p95 = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
  };
  const $ = (selector) => document.querySelector(selector);
  const button = (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

  async function sample(n, action) {
    const values = [];
    for (let i = 0; i < n; i++) {
      await idle();
      const start = performance.now();
      action(i);
      await frame();
      values.push(Number((performance.now() - start).toFixed(1)));
    }
    return { p95: p95(values), samples: values };
  }

  function seats() {
    return [...document.querySelectorAll('[data-seat-id]')];
  }

  async function run(n = 20, measure = 'frame') {
    mode = measure;
    const results = { measure };
    const all = seats();
    results.seats = all.length;
    results.format = await sample(n, (i) => button(i % 2 ? 'Tradicional' : 'Meia-lua').click());
    button('Tradicional').click();
    await idle();
    // Selecionar cadeira (sem pessoa selecionada): só muda seleção.
    const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    results.selectSeat = await sample(n, (i) => click(seats()[(i * 7 + 1) % all.length]));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await idle();
    // Selecionar pessoa na lista.
    const guests = () => document.querySelectorAll('.guest-choice');
    results.selectGuest = await sample(n, (i) => guests()[(i * 11) % guests().length].click());
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await idle();
    // Trocar ocupantes: pessoa selecionada + clique em cadeira ocupada.
    const swap = [];
    for (let i = 0; i < n; i++) {
      guests()[(i * 13) % Math.min(all.length, guests().length)].click();
      await idle();
      const start = performance.now();
      click(seats()[(i * 17 + 5) % all.length]);
      await frame();
      swap.push(Number((performance.now() - start).toFixed(1)));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    results.swap = { p95: p95(swap), samples: swap };
    await idle();
    // Filtro "Sem lugar" alternado.
    results.filter = await sample(n, () => button('Sem lugar').click());
    if (button('Todas')?.getAttribute('aria-pressed') !== 'true') button('Todas').click();
    await idle();
    // Busca: digitar um termo e limpar alternadamente.
    const search = $('#guest-search');
    results.search = await sample(n, (i) => {
      search.value = i % 2 ? '' : 'fictícia 1';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const summary = Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, typeof v === 'object' ? v.p95 : v]),
    );
    console.table(summary);
    return { summary, results };
  }

  function seed(kind = 'max') {
    const key = 'enlace:draft:anonymous:v1';
    const draft = JSON.stringify({
      format: 'enlace-project',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project: project(kind),
    });
    localStorage.setItem(key, draft);
    // O editor grava o rascunho em `pagehide`; este ouvinte roda depois e preserva o sintético.
    window.addEventListener('pagehide', () => localStorage.setItem(key, draft));
    return 'Rascunho sintético gravado; recarregue a página.';
  }

  window.enlaceBench = { seed, run };
})();
