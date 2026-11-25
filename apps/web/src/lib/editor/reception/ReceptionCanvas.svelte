<script lang="ts">
  import type { ReceptionItemKind } from '@enlace/contracts';
  import {
    formatMeters,
    getDoorGeometry,
    getTableSeatPositions,
    GRID_CM,
    placeDoorNear,
    snapToGrid,
    type ReceptionElementRef,
  } from '@enlace/domain/reception';
  import { sameRef, type ReceptionCanvasProps, type ReceptionSelection } from './contracts';

  let {
    reception,
    occupancy,
    warnedIds,
    selected,
    assigning,
    readonly = false,
    onSelect,
    onMove,
    onMoveDoor,
  }: ReceptionCanvasProps = $props();

  const uid = $props.id();
  const MAX_COORDINATE = 10_000;
  const MARGIN_CM = 100;
  const CHAIR_RADIUS_CM = 18;
  const DRAG_THRESHOLD_PX = 4;
  const SLIDE_OFFSET_CM = 8;
  const DOOR_TOUCH_PAD_CM = 30;
  const OPENING_LABEL = {
    inward: 'para dentro',
    outward: 'para fora',
    sliding: 'de correr',
  } as const;
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
    // Folha de porta que abre para fora ocupa a largura da porta além da parede.
    for (const door of room.doors) {
      if (door.opening !== 'outward') continue;
      const g = getDoorGeometry(room.outline, door);
      if (!g) continue;
      extend(g.start.x - g.inward.x * door.width, g.start.y - g.inward.y * door.width, 0);
      extend(g.end.x - g.inward.x * door.width, g.end.y - g.inward.y * door.width, 0);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  });

  const fontSize = $derived(Math.max(14, frame.width / 70));
  const wallWidth = $derived(Math.max(10, frame.width / 220));

  // Pré-visualização da porta arrastada: sobrescreve a posição só no desenho.
  let doorPreview = $state<{ id: string; wall: number; offset: number } | null>(null);

  const wallLengthOf = (wall: number) => {
    const a = room.outline[wall];
    const b = room.outline[(wall + 1) % room.outline.length];
    return a && b ? Math.abs(b.x - a.x) + Math.abs(b.y - a.y) : 0;
  };

  const doors = $derived(
    room.doors.flatMap((source, index) => {
      const door =
        doorPreview?.id === source.id
          ? { ...source, wall: doorPreview.wall, offset: doorPreview.offset }
          : source;
      const g = getDoorGeometry(room.outline, door);
      if (!g) return [];
      const { start: a, end: b, along, inward } = g;
      const w = door.width;
      const xs = [a.x, b.x];
      const ys = [a.y, b.y];
      let swing = '';
      let panel = '';
      let arrow = '';
      if (door.opening === 'sliding') {
        const o = SLIDE_OFFSET_CM;
        const pa = { x: a.x + inward.x * o, y: a.y + inward.y * o };
        const pb = { x: b.x + inward.x * o, y: b.y + inward.y * o };
        panel = `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`;
        // Seta ao longo da parede, indicando o deslizamento.
        const lift = o + 20;
        const at = (t: number, up: number) => ({
          x: a.x + along.x * t + inward.x * up,
          y: a.y + along.y * t + inward.y * up,
        });
        const tail = at(w * 0.3, lift);
        const tip = at(w * 0.7, lift);
        const h1 = at(w * 0.7 - 12, lift + 8);
        const h2 = at(w * 0.7 - 12, lift - 8);
        arrow = `M ${tail.x} ${tail.y} L ${tip.x} ${tip.y} M ${h1.x} ${h1.y} L ${tip.x} ${tip.y} L ${h2.x} ${h2.y}`;
        xs.push(tip.x, tail.x, h1.x, h2.x);
        ys.push(tip.y, tail.y, h1.y, h2.y);
      } else {
        const side = door.opening === 'outward' ? -1 : 1;
        const nx = inward.x * side;
        const ny = inward.y * side;
        const leafX = a.x + nx * w;
        const leafY = a.y + ny * w;
        const sweep = nx * along.y - ny * along.x > 0 ? 1 : 0;
        swing = `M ${a.x} ${a.y} L ${leafX} ${leafY} A ${w} ${w} 0 0 ${sweep} ${b.x} ${b.y}`;
        xs.push(leafX, b.x + nx * w);
        ys.push(leafY, b.y + ny * w);
      }
      const halo = wallWidth / 2 + 14;
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const pad = DOOR_TOUCH_PAD_CM;
      const touchX = Math.min(a.x, b.x) - pad;
      const touchY = Math.min(a.y, b.y) - pad;
      return [
        {
          id: door.id,
          wall: door.wall,
          offset: door.offset,
          width: w,
          opening: door.opening,
          along,
          label: `Porta ${index + 1}, ${OPENING_LABEL[door.opening]}, parede ${door.wall + 1}, a ${formatMeters(door.offset)} m do início`,
          gap: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
          swing,
          panel,
          arrow,
          halo: {
            x: minX - halo,
            y: minY - halo,
            width: Math.max(...xs) - minX + halo * 2,
            height: Math.max(...ys) - minY + halo * 2,
          },
          touch: {
            x: touchX,
            y: touchY,
            width: Math.max(a.x, b.x) + pad - touchX,
            height: Math.max(a.y, b.y) + pad - touchY,
          },
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
    return (
      reception.tables[0]?.id ??
      reception.items[0]?.id ??
      room.columns[0]?.id ??
      room.doors[0]?.id ??
      null
    );
  });
  const isSelected = (kind: ReceptionSelection['kind'], id: string) =>
    sameRef(selected, { kind, id });

  // Tamanho em pixels a partir da área disponível (mesma abordagem da planta da cerimônia).
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let zoomIndex = $state(2);
  const zoom = $derived(ZOOM_STEPS[zoomIndex]!);
  // Durante um gesto o tamanho do SVG fica congelado: avisos novos podem mexer no layout e
  // deslocar o elemento sob o ponteiro.
  let gesturing = false;
  let sizeWidth = $state(0);
  let sizeHeight = $state(0);
  $effect(() => {
    const w = viewportWidth;
    const h = viewportHeight;
    if (!gesturing) {
      sizeWidth = w;
      sizeHeight = h;
    }
  });
  function endGesture() {
    gesturing = false;
    sizeWidth = viewportWidth;
    sizeHeight = viewportHeight;
  }
  // O `click` que segue um gesto iniciado num elemento nunca deve desselecionar.
  let gestureOnElement = false;

  const svgSize = $derived.by(() => {
    if (!sizeWidth || !sizeHeight) return null;
    const fit = Math.min(sizeWidth / frame.width, sizeHeight / frame.height);
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
  type DoorDrag = {
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    wall: number;
    offset: number;
    width: number;
    moved: boolean;
    raf: number;
    next: { wall: number; offset: number } | null;
  };
  let doorDrag: DoorDrag | null = null;
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
    if (drag || doorDrag || (event.pointerType === 'mouse' && event.button !== 0)) return;
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
    gesturing = true;
    gestureOnElement = true;
    group.focus({ preventScroll: true });
    event.preventDefault();
  }

  function pointerMove(event: PointerEvent) {
    const d = drag;
    if (!d || event.pointerId !== d.pointerId || assigning || readonly) return;
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
    endGesture();
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
    endGesture();
    if (d.raf) cancelAnimationFrame(d.raf);
    d.group.removeAttribute('transform');
  }

  // Ponteiro (px da tela) para coordenadas do SVG, já encaixado numa parede.
  function doorTarget(d: DoorDrag) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(d.clientX, d.clientY).matrixTransform(matrix.inverse());
    return placeDoorNear(room.outline, { x: p.x, y: p.y }, d.width);
  }

  function doorFrameTick() {
    const d = doorDrag;
    if (!d) return;
    d.raf = 0;
    const next = doorTarget(d);
    if (!next) return;
    d.next = next;
    doorPreview = { id: d.id, ...next };
  }

  function doorPointerDown(
    event: PointerEvent,
    id: string,
    wall: number,
    offset: number,
    width: number,
  ) {
    if (drag || doorDrag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (!svg.getScreenCTM()) return;
    const group = event.currentTarget as SVGGElement;
    try {
      group.setPointerCapture(event.pointerId);
    } catch {
      /* ponteiro sintético não pode ser capturado */
    }
    doorDrag = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      wall,
      offset,
      width,
      moved: false,
      raf: 0,
      next: null,
    };
    gesturing = true;
    gestureOnElement = true;
    group.focus({ preventScroll: true });
    event.preventDefault();
  }

  function doorPointerMove(event: PointerEvent) {
    const d = doorDrag;
    if (!d || event.pointerId !== d.pointerId || assigning || readonly) return;
    d.clientX = event.clientX;
    d.clientY = event.clientY;
    if (!d.moved) {
      if (Math.hypot(d.clientX - d.startX, d.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
    }
    if (!d.raf) d.raf = requestAnimationFrame(doorFrameTick);
  }

  function doorPointerUp(event: PointerEvent) {
    const d = doorDrag;
    if (!d || event.pointerId !== d.pointerId) return;
    doorDrag = null;
    endGesture();
    if (d.raf) cancelAnimationFrame(d.raf);
    doorPreview = null;
    const ref: ReceptionSelection = { kind: 'door', id: d.id };
    if (!d.moved || assigning) {
      onSelect(ref);
      return;
    }
    d.clientX = event.clientX;
    d.clientY = event.clientY;
    const next = doorTarget(d) ?? d.next;
    if (!sameRef(selected, ref)) onSelect(ref);
    if (next && (next.wall !== d.wall || next.offset !== d.offset))
      onMoveDoor(d.id, next.wall, next.offset);
  }

  function doorPointerCancel(event: PointerEvent) {
    const d = doorDrag;
    if (!d || event.pointerId !== d.pointerId) return;
    doorDrag = null;
    endGesture();
    if (d.raf) cancelAnimationFrame(d.raf);
    doorPreview = null;
  }

  function doorKeyDown(
    event: KeyboardEvent,
    door: {
      id: string;
      wall: number;
      offset: number;
      width: number;
      along: { x: number; y: number };
    },
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onSelect(null);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect({ kind: 'door', id: door.id });
      return;
    }
    if (readonly) return;
    // Seta no sentido de `along` aumenta o deslocamento; a perpendicular é ignorada.
    const direction =
      event.key === 'ArrowRight'
        ? door.along.x
        : event.key === 'ArrowLeft'
          ? -door.along.x
          : event.key === 'ArrowDown'
            ? door.along.y
            : event.key === 'ArrowUp'
              ? -door.along.y
              : 0;
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 50 : GRID_CM;
    const max = Math.max(0, wallLengthOf(door.wall) - door.width);
    const next = Math.max(0, Math.min(max, door.offset + direction * step));
    if (next !== door.offset) onMoveDoor(door.id, door.wall, next);
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
    if (readonly) return;
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

  function isFloor(el: Element) {
    return el === svg || el.hasAttribute('data-floor');
  }

  function backgroundPointerDown(event: PointerEvent) {
    if (isFloor(event.target as Element)) gestureOnElement = false;
  }

  function backgroundClick(event: MouseEvent) {
    if (gestureOnElement) {
      gestureOnElement = false;
      return;
    }
    if (isFloor(event.target as Element)) onSelect(null);
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
      onpointerdown={backgroundPointerDown}
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
      </g>

      {#each doors as door (door.id)}
        <g
          class="element door"
          class:selected={isSelected('door', door.id)}
          role="button"
          tabindex={tabStopId === door.id ? 0 : -1}
          aria-label={door.label}
          aria-pressed={isSelected('door', door.id)}
          onpointerdown={(e) => doorPointerDown(e, door.id, door.wall, door.offset, door.width)}
          onpointermove={doorPointerMove}
          onpointerup={doorPointerUp}
          onpointercancel={doorPointerCancel}
          onkeydown={(e) => doorKeyDown(e, door)}
        >
          <rect class="halo" {...door.halo} rx="10" />
          <rect {...door.touch} fill="transparent" pointer-events="all" />
          <path d={door.gap} stroke="#fffefb" stroke-width={wallWidth + 4} fill="none" />
          {#if door.opening === 'sliding'}
            <path d={door.panel} stroke="#b89364" stroke-width="6" fill="none" />
            <path
              d={door.arrow}
              stroke="#626e63"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          {:else}
            <path
              d={door.swing}
              stroke="#b89364"
              stroke-width="3"
              fill="none"
              stroke-dasharray="10 6"
            />
          {/if}
          <path d={door.gap} stroke="#b89364" stroke-width={wallWidth / 2} fill="none" />
        </g>
      {/each}

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
