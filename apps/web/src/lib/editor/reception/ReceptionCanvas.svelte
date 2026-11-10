<script lang="ts">
  import type { ReceptionItemKind } from '@enlace/contracts';
  import {
    formatMeters,
    getTableSeatPositions,
    GRID_CM,
    snapToGrid,
    type ReceptionElementRef,
  } from '@enlace/domain/reception';
  import { sameRef, type ReceptionCanvasProps } from './contracts';

  let {
    reception,
    occupancy,
    warnedIds,
    selected,
    assigning,
    onSelect,
    onMove,
  }: ReceptionCanvasProps = $props();

  const uid = $props.id();
  const MAX_COORDINATE = 10_000;
  const MARGIN_CM = 100;
  const CHAIR_RADIUS_CM = 18;
  const DRAG_THRESHOLD_PX = 4;
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

  const KIND_STYLE: Record<
    ReceptionItemKind,
    { label: string; fill: string; stroke: string; dashed: boolean }
  > = {
    dance_floor: { label: 'pista de dança', fill: '#eef3e6', stroke: '#72977d', dashed: true },
    dj: { label: 'DJ e som', fill: '#dfe3da', stroke: '#626e63', dashed: false },
    cake_table: { label: 'mesa de bolo', fill: '#f3e6d3', stroke: '#b89364', dashed: false },
    sweets_table: { label: 'mesa de doces', fill: '#f3e6d3', stroke: '#b89364', dashed: false },
    bar: { label: 'bar', fill: '#dce8de', stroke: '#295842', dashed: false },
    buffet: { label: 'buffet', fill: '#e8e3d4', stroke: '#626e63', dashed: false },
    photo_area: { label: 'área de fotos', fill: '#f6efe3', stroke: '#b89364', dashed: true },
    custom: { label: 'elemento', fill: '#eceee8', stroke: '#626e63', dashed: false },
  };

  const room = $derived(reception.room);
  const outlinePoints = $derived(room.outline.map((p) => `${p.x},${p.y}`).join(' '));

  // Quadro: contorno do salão mais margem; elementos fora do salão ampliam o quadro.
  const frame = $derived.by(() => {
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
    for (const p of room.outline) include(p.x, p.y, 0);
    left -= MARGIN_CM;
    right += MARGIN_CM;
    top -= MARGIN_CM;
    bottom += MARGIN_CM;
    // Só amplia quando o elemento sai do salão com margem.
    const inner = { left, right, top, bottom };
    const extend = (x: number, y: number, reach: number) => {
      if (
        x - reach >= inner.left &&
        x + reach <= inner.right &&
        y - reach >= inner.top &&
        y + reach <= inner.bottom
      )
        return;
      include(x, y, reach + 20);
    };
    for (const t of reception.tables)
      extend(t.x, t.y, (Math.hypot(t.width, t.depth) / 2) * 1.1 + 60);
    for (const i of reception.items) extend(i.x, i.y, Math.hypot(i.width, i.depth) / 2);
    for (const c of room.columns) extend(c.x, c.y, Math.hypot(c.width, c.depth) / 2);
    return { x: left, y: top, width: right - left, height: bottom - top };
  });

  const fontSize = $derived(Math.max(14, frame.width / 70));
  const wallWidth = $derived(Math.max(10, frame.width / 220));

  // Quadro retangular livre de reatividade fina: só o necessário para posicionar cada porta.
  const polygonOrientation = $derived.by(() => {
    const n = room.outline.length;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = room.outline[i]!;
      const b = room.outline[(i + 1) % n]!;
      area += a.x * b.y - b.x * a.y;
    }
    return area >= 0 ? 1 : -1;
  });

  const doors = $derived(
    room.doors.flatMap((door) => {
      const start = room.outline[door.wall];
      const end = room.outline[(door.wall + 1) % room.outline.length];
      if (!start || !end) return [];
      const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      if (!length) return [];
      const dx = Math.sign(end.x - start.x);
      const dy = Math.sign(end.y - start.y);
      const ax = start.x + dx * door.offset;
      const ay = start.y + dy * door.offset;
      const bx = start.x + dx * (door.offset + door.width);
      const by = start.y + dy * (door.offset + door.width);
      // Normal para dentro do salão (contorno anti-horário: interior à esquerda).
      const nx = -dy * polygonOrientation;
      const ny = dx * polygonOrientation;
      const leafX = ax + nx * door.width;
      const leafY = ay + ny * door.width;
      const sweep = nx * dy - ny * dx > 0 ? 1 : 0;
      return [
        {
          id: door.id,
          gap: `M ${ax} ${ay} L ${bx} ${by}`,
          swing: `M ${ax} ${ay} L ${leafX} ${leafY} A ${door.width} ${door.width} 0 0 ${sweep} ${bx} ${by}`,
        },
      ];
    }),
  );

  const clip = (text: string, maxChars: number) =>
    text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
  const maxCharsFor = (width: number) => Math.max(5, Math.floor(width / (fontSize * 0.55)));
  const position = (x: number, y: number) =>
    `centro a ${formatMeters(x)} m da esquerda e ${formatMeters(y)} m do topo`;

  // Uma parada de Tab (o selecionado ou o primeiro elemento); o resto fica por Tab reverso/clique.
  const tabStopId = $derived.by(() => {
    if (selected) return selected.id;
    return reception.tables[0]?.id ?? reception.items[0]?.id ?? room.columns[0]?.id ?? null;
  });
  const isSelected = (kind: ReceptionElementRef['kind'], id: string) =>
    sameRef(selected, { kind, id });

  // Tamanho em pixels a partir da área disponível (mesma abordagem da planta da cerimônia).
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let zoomIndex = $state(2);
  const zoom = $derived(ZOOM_STEPS[zoomIndex]!);
  const svgSize = $derived.by(() => {
    if (!viewportWidth || !viewportHeight) return null;
    const fit = Math.min(viewportWidth / frame.width, viewportHeight / frame.height);
    return {
      width: Math.max(80, Math.floor(frame.width * fit * zoom)),
      height: Math.max(80, Math.floor(frame.height * fit * zoom)),
    };
  });

  // Arraste: estado fora da reatividade; durante o movimento só o `transform` do <g> muda.
  type Drag = {
    ref: ReceptionElementRef;
    group: SVGGElement;
    pointerId: number;
    inv: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    clientX: number;
    clientY: number;
    moved: boolean;
    raf: number;
    nextX: number;
    nextY: number;
  };
  let drag: Drag | null = null;
  let svg: SVGSVGElement;

  function target(d: Drag) {
    const dx = (d.clientX - d.startX) * d.inv;
    const dy = (d.clientY - d.startY) * d.inv;
    d.nextX = Math.max(0, Math.min(MAX_COORDINATE, snapToGrid(d.originX + dx)));
    d.nextY = Math.max(0, Math.min(MAX_COORDINATE, snapToGrid(d.originY + dy)));
  }

  function frameTick() {
    const d = drag;
    if (!d) return;
    d.raf = 0;
    target(d);
    d.group.setAttribute('transform', `translate(${d.nextX - d.originX} ${d.nextY - d.originY})`);
  }

  function pointerDown(
    event: PointerEvent,
    kind: ReceptionElementRef['kind'],
    id: string,
    x: number,
    y: number,
  ) {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const matrix = svg.getScreenCTM();
    if (!matrix || !matrix.a) return;
    const group = event.currentTarget as SVGGElement;
    try {
      group.setPointerCapture(event.pointerId);
    } catch {
      /* ponteiro sintético não pode ser capturado */
    }
    drag = {
      ref: { kind, id },
      group,
      pointerId: event.pointerId,
      inv: 1 / matrix.a,
      startX: event.clientX,
      startY: event.clientY,
      originX: x,
      originY: y,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      raf: 0,
      nextX: x,
      nextY: y,
    };
    group.focus({ preventScroll: true });
    event.preventDefault();
  }

  function pointerMove(event: PointerEvent) {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId || assigning) return;
    d.clientX = event.clientX;
    d.clientY = event.clientY;
    if (!d.moved) {
      if (Math.hypot(d.clientX - d.startX, d.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
    }
    if (!d.raf) d.raf = requestAnimationFrame(frameTick);
  }

  function pointerUp(event: PointerEvent) {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId) return;
    drag = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.group.removeAttribute('transform');
    if (!d.moved || assigning) {
      onSelect(d.ref);
      return;
    }
    d.clientX = event.clientX;
    d.clientY = event.clientY;
    target(d);
    if (!sameRef(selected, d.ref)) onSelect(d.ref);
    if (d.nextX !== d.originX || d.nextY !== d.originY) onMove(d.ref, d.nextX, d.nextY);
  }

  function pointerCancel(event: PointerEvent) {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId) return;
    drag = null;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.group.removeAttribute('transform');
  }

  function keyDown(
    event: KeyboardEvent,
    kind: ReceptionElementRef['kind'],
    id: string,
    x: number,
    y: number,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onSelect(null);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect({ kind, id });
      return;
    }
    const step = event.shiftKey ? 50 : GRID_CM;
    const delta =
      event.key === 'ArrowLeft'
        ? [-step, 0]
        : event.key === 'ArrowRight'
          ? [step, 0]
          : event.key === 'ArrowUp'
            ? [0, -step]
            : event.key === 'ArrowDown'
              ? [0, step]
              : null;
    if (!delta) return;
    event.preventDefault();
    const nextX = Math.max(0, Math.min(MAX_COORDINATE, snapToGrid(x + delta[0]!)));
    const nextY = Math.max(0, Math.min(MAX_COORDINATE, snapToGrid(y + delta[1]!)));
    if (nextX !== x || nextY !== y) onMove({ kind, id }, nextX, nextY);
  }

  function backgroundClick(event: MouseEvent) {
    const el = event.target as Element;
    if (el === svg || el.hasAttribute('data-floor')) onSelect(null);
  }

  const zoomOut = () => (zoomIndex = Math.max(0, zoomIndex - 1));
  const zoomIn = () => (zoomIndex = Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1));
</script>

<div class="reception-canvas">
  <div class="toolbar" role="toolbar" aria-label="Zoom da planta da festa">
    <button type="button" onclick={() => (zoomIndex = 2)} disabled={zoomIndex === 2}>
      Ajustar
    </button>
    <button type="button" aria-label="Diminuir zoom" onclick={zoomOut} disabled={zoomIndex === 0}>
      −
    </button>
    <span class="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
    <button
      type="button"
      aria-label="Aumentar zoom"
      onclick={zoomIn}
      disabled={zoomIndex === ZOOM_STEPS.length - 1}
    >
      +
    </button>
  </div>
  <div class="viewport" bind:offsetWidth={viewportWidth} bind:offsetHeight={viewportHeight}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      class="plan"
      class:assigning
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      style:width={svgSize ? `${svgSize.width}px` : '100%'}
      style:height={svgSize ? `${svgSize.height}px` : null}
      role="group"
      aria-label="Planta da festa"
      onclick={backgroundClick}
    >
      <defs>
        <pattern id="{uid}-grid" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M 100 0 H 0 V 100" fill="none" stroke="#dfe3da" stroke-width="1.5" />
        </pattern>
      </defs>
      <rect
        data-floor
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        fill="#f4f5f0"
      />
      <polygon data-floor points={outlinePoints} fill="#fffefb" />
      <polygon points={outlinePoints} fill="url(#{uid}-grid)" pointer-events="none" />

      <g aria-hidden="true" pointer-events="none">
        <polygon
          points={outlinePoints}
          fill="none"
          stroke="#27342c"
          stroke-width={wallWidth}
          stroke-linejoin="miter"
        />
        {#each doors as door (door.id)}
          <path d={door.gap} stroke="#fffefb" stroke-width={wallWidth + 4} fill="none" />
          <path
            d={door.swing}
            stroke="#b89364"
            stroke-width="3"
            fill="none"
            stroke-dasharray="10 6"
          />
          <path d={door.gap} stroke="#b89364" stroke-width={wallWidth / 2} fill="none" />
        {/each}
      </g>

      {#each room.columns as column (column.id)}
        {@const warned = warnedIds.has(column.id)}
        <g
          class="element"
          class:selected={isSelected('column', column.id)}
          role="button"
          tabindex={tabStopId === column.id ? 0 : -1}
          aria-label={`Coluna, ${position(column.x, column.y)}${warned ? ', com aviso' : ''}`}
          aria-pressed={isSelected('column', column.id)}
          onpointerdown={(e) => pointerDown(e, 'column', column.id, column.x, column.y)}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerCancel}
          onkeydown={(e) => keyDown(e, 'column', column.id, column.x, column.y)}
        >
          <rect
            class="halo"
            x={column.x - column.width / 2 - 14}
            y={column.y - column.depth / 2 - 14}
            width={column.width + 28}
            height={column.depth + 28}
            rx="8"
          />
          <rect
            x={column.x - column.width / 2}
            y={column.y - column.depth / 2}
            width={column.width}
            height={column.depth}
            fill="#626e63"
            stroke={warned ? '#923d35' : '#27342c'}
            stroke-width={warned ? 5 : 2}
            stroke-dasharray={warned ? '10 6' : null}
          />
        </g>
      {/each}

      {#each reception.items as item (item.id)}
        {@const style = KIND_STYLE[item.kind]}
        {@const warned = warnedIds.has(item.id)}
        <g
          class="element"
          class:selected={isSelected('item', item.id)}
          role="button"
          tabindex={tabStopId === item.id ? 0 : -1}
          aria-label={`${item.name}${item.name === style.label ? '' : `, ${style.label}`}, ${position(item.x, item.y)}${warned ? ', com aviso' : ''}`}
          aria-pressed={isSelected('item', item.id)}
          onpointerdown={(e) => pointerDown(e, 'item', item.id, item.x, item.y)}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerCancel}
          onkeydown={(e) => keyDown(e, 'item', item.id, item.x, item.y)}
        >
          <g transform={`rotate(${item.rotation} ${item.x} ${item.y})`}>
            <rect
              class="halo"
              x={item.x - item.width / 2 - 14}
              y={item.y - item.depth / 2 - 14}
              width={item.width + 28}
              height={item.depth + 28}
              rx="10"
            />
            <rect
              x={item.x - item.width / 2}
              y={item.y - item.depth / 2}
              width={item.width}
              height={item.depth}
              rx="6"
              fill={style.fill}
              stroke={warned ? '#923d35' : style.stroke}
              stroke-width={warned ? 5 : 3}
              stroke-dasharray={warned ? '14 8' : style.dashed ? '16 10' : null}
            />
          </g>
          <text x={item.x} y={item.y + fontSize * 0.35} text-anchor="middle" font-size={fontSize}>
            {clip(item.name, maxCharsFor(Math.max(item.width, item.depth)))}
          </text>
        </g>
      {/each}

      {#each reception.tables as table (table.id)}
        {@const warned = warnedIds.has(table.id)}
        {@const taken = occupancy.get(table.id) ?? 0}
        {@const chairs = getTableSeatPositions(table)}
        <g
          class="element table"
          class:selected={isSelected('table', table.id)}
          class:target={assigning}
          role="button"
          tabindex={tabStopId === table.id ? 0 : -1}
          aria-label={`${table.name}, ${table.shape === 'round' ? 'redonda' : 'retangular'}, ${taken} de ${table.seats} lugares ocupados, ${position(table.x, table.y)}${warned ? ', com aviso' : ''}`}
          aria-pressed={isSelected('table', table.id)}
          onpointerdown={(e) => pointerDown(e, 'table', table.id, table.x, table.y)}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerCancel}
          onkeydown={(e) => keyDown(e, 'table', table.id, table.x, table.y)}
        >
          {#each chairs as chair, index (index)}
            <circle
              cx={chair.x}
              cy={chair.y}
              r={CHAIR_RADIUS_CM}
              fill={index < taken ? '#72977d' : '#fffefb'}
              stroke={warned ? '#923d35' : '#626e63'}
              stroke-width="2"
            />
          {/each}
          {#if table.shape === 'round'}
            <circle class="halo" cx={table.x} cy={table.y} r={table.width / 2 + 48} />
            <circle
              class="body"
              cx={table.x}
              cy={table.y}
              r={table.width / 2}
              fill="#fffefb"
              stroke={warned ? '#923d35' : assigning ? '#72977d' : '#27342c'}
              stroke-width={warned || assigning ? 5 : 3}
              stroke-dasharray={warned ? '12 7' : null}
            />
          {:else}
            <g transform={`rotate(${table.rotation} ${table.x} ${table.y})`}>
              <rect
                class="halo"
                x={table.x - table.width / 2 - 48}
                y={table.y - table.depth / 2 - 48}
                width={table.width + 96}
                height={table.depth + 96}
                rx="14"
              />
              <rect
                class="body"
                x={table.x - table.width / 2}
                y={table.y - table.depth / 2}
                width={table.width}
                height={table.depth}
                rx="6"
                fill="#fffefb"
                stroke={warned ? '#923d35' : assigning ? '#72977d' : '#27342c'}
                stroke-width={warned || assigning ? 5 : 3}
                stroke-dasharray={warned ? '12 7' : null}
              />
            </g>
          {/if}
          <text x={table.x} y={table.y - fontSize * 0.1} text-anchor="middle" font-size={fontSize}>
            {clip(table.name, maxCharsFor(table.width))}
          </text>
          <text
            class="count"
            x={table.x}
            y={table.y + fontSize * 1.1}
            text-anchor="middle"
            font-size={fontSize * 0.9}
          >
            {taken}/{table.seats}
          </text>
        </g>
      {/each}
    </svg>
  </div>
</div>

<style>
  .reception-canvas {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    background: #fffefb;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid #dfe3da;
  }
  .toolbar button {
    min-width: 36px;
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid #dfe3da;
    border-radius: 8px;
    background: #fffefb;
    color: #27342c;
    font: inherit;
    cursor: pointer;
  }
  .toolbar button:hover:not(:disabled) {
    border-color: #295842;
  }
  .toolbar button:focus-visible {
    outline: 3px solid #6d936f;
    outline-offset: 2px;
  }
  .toolbar button:disabled {
    color: #626e63;
    cursor: default;
    opacity: 0.6;
  }
  .zoom-value {
    min-width: 3.5em;
    text-align: center;
    color: #626e63;
    font-size: 0.875rem;
  }
  .viewport {
    min-height: 0;
    flex: 1;
    overflow: auto;
    display: grid;
    background: #fffefb;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .plan {
    display: block;
    margin: auto;
    max-width: none;
    user-select: none;
    -webkit-user-select: none;
  }
  text {
    font-family: 'Segoe UI', system-ui, sans-serif;
    fill: #27342c;
    font-weight: 600;
    pointer-events: none;
  }
  .count {
    fill: #626e63;
    font-weight: 500;
  }
  .element {
    cursor: grab;
    outline: none;
    touch-action: none;
  }
  .plan.assigning .table {
    cursor: pointer;
  }
  .halo {
    fill: none;
    stroke: none;
    stroke-width: 6;
    pointer-events: none;
  }
  .element.selected .halo,
  .element:focus-visible .halo {
    stroke: #6d936f;
  }
  .element.selected .halo {
    stroke: #295842;
  }
  @media (prefers-reduced-motion: no-preference) {
    .halo {
      transition: stroke 120ms ease-out;
    }
  }
</style>
