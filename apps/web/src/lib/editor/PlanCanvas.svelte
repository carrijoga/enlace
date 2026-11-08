<script lang="ts">
  import { tick } from 'svelte';
  import type { CeremonyProject } from '@enlace/contracts';
  import type { LayoutGeometry, SeatGeometry } from '@enlace/domain';
  import { GUEST_CATEGORIES } from './guest-categories';

  let {
    project,
    geometry,
    selectedGuestId,
    selectedSeatId,
    zoom,
    onSeatSelect,
    onGuestDrop,
  }: {
    project: CeremonyProject;
    geometry: LayoutGeometry;
    selectedGuestId: string | null;
    selectedSeatId: string | null;
    zoom: number;
    onSeatSelect: (id: string) => void;
    onGuestDrop: (guestId: string, seatId: string) => void;
  } = $props();
  let viewport: HTMLDivElement;
  let svg: SVGSVGElement;
  const guests = $derived(new Map(project.guests.map((guest) => [guest.id, guest])));
  const assignments = $derived(new Map(project.assignments.map((a) => [a.seatId, a.guestId])));
  let hovered = $state<string | null>(null);
  // Valor primitivo: o efeito só roda quando a largura muda de fato, não a cada nova geometria
  // (trocar o formato gera outro objeto com a mesma largura e forçaria layout síncrono).
  const mapWidth = $derived(geometry.width);
  // Tamanho da planta em pixels, calculado a partir da área disponível (offset* não varia com
  // barras de rolagem nem com o conteúdo). Com largura/altura percentuais o Chrome refaz o layout
  // de todas as cadeiras do SVG a cada alteração; com tamanho definido, só o que mudou.
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  const mapSize = $derived.by(() => {
    if (!viewportWidth || !viewportHeight) return null;
    const ratio = geometry.height / geometry.width;
    if (zoom === 0) {
      const width = Math.min(viewportWidth, viewportHeight / ratio);
      return { width: Math.floor(width), height: Math.floor(width * ratio) };
    }
    const width = Math.max(zoom * viewportWidth, 760 * zoom);
    return { width: Math.round(width), height: Math.round(width * ratio) };
  });

  $effect(() => {
    void zoom;
    void mapWidth;
    void tick().then(() => {
      if (viewport) viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    });
  });

  function seatKey(event: KeyboardEvent, seat: SeatGeometry) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSeatSelect(seat.id);
      return;
    }
    const vectors: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = vectors[event.key];
    if (!direction) return;
    event.preventDefault();
    const candidates = geometry.seats.filter(
      (other) => (other.x - seat.x) * direction[0] + (other.y - seat.y) * direction[1] > 10,
    );
    const score = (other: SeatGeometry) => {
      const dx = other.x - seat.x,
        dy = other.y - seat.y;
      const lateral = Math.abs(dx * direction[1] - dy * direction[0]);
      return Math.hypot(dx, dy) + lateral * 3;
    };
    candidates.sort((a, b) => score(a) - score(b));
    const next = candidates[0];
    if (next) {
      const element = svg.querySelector<SVGGElement>(`[data-seat-id="${next.id}"]`);
      element?.focus();
    }
  }
  function dropGuest(event: DragEvent, id: string) {
    event.preventDefault();
    hovered = null;
    const guestId =
      event.dataTransfer?.getData('application/x-enlace-guest') ||
      event.dataTransfer?.getData('text/plain');
    if (guestId && guests.has(guestId)) onGuestDrop(guestId, id);
  }
</script>

<div
  class="map-viewport"
  bind:this={viewport}
  bind:offsetWidth={viewportWidth}
  bind:offsetHeight={viewportHeight}
>
  <svg
    bind:this={svg}
    class="ceremony-map"
    class:fit={zoom === 0 && !mapSize}
    viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    style:width={mapSize ? `${mapSize.width}px` : zoom ? `${zoom * 100}%` : '100%'}
    style:height={mapSize ? `${mapSize.height}px` : null}
    style:min-width={mapSize ? null : zoom ? `${760 * zoom}px` : '0'}
    role="group"
    aria-label={`Planta ${project.layout.mode === 'curve' ? 'em meia-lua' : 'tradicional'} com ${geometry.seats.length} cadeiras`}
  >
    <rect width={geometry.width} height={geometry.height} fill="#fffefb" />
    <g aria-hidden="true">
      <path
        d={`M ${geometry.center - 129} 171 A 129 113 0 0 1 ${geometry.center + 129} 171`}
        fill="none"
        stroke="#8ca98c"
        stroke-width="2"
      />
      <path
        d={`M ${geometry.center - 116} 171 A 116 100 0 0 1 ${geometry.center + 116} 171`}
        fill="none"
        stroke="#dfe7d7"
        stroke-width="1.5"
      />
      <circle cx={geometry.center - 129} cy="171" r="4" fill="#b89364" />
      <circle cx={geometry.center + 129} cy="171" r="4" fill="#b89364" />
      <rect x={geometry.center - 48} y="170" width="96" height="28" rx="9" fill="#e5eadd" />
      <text x={geometry.center} y="188" class="altar" text-anchor="middle">ALTAR</text>
      <path
        d={`M ${geometry.center - geometry.corridorHalf} 218 V ${geometry.height - 39} M ${geometry.center + geometry.corridorHalf} 218 V ${geometry.height - 39}`}
        fill="none"
        stroke="#dfe3d7"
        stroke-width="1.5"
        stroke-dasharray="5 9"
      />
      <text x={geometry.center} y="237" text-anchor="middle" class="aisle"
        >CORREDOR · {project.layout.aisleWidth.toLocaleString('pt-BR')} m</text
      >
      <text x={geometry.center - 235} y="271" text-anchor="middle" class="side">ESQUERDA</text>
      <text x={geometry.center + 235} y="271" text-anchor="middle" class="side">DIREITA</text>
    </g>
    {#each geometry.seats as seat, i (seat.id)}
      {@const guest = guests.get(assignments.get(seat.id) ?? '')}
      {@const category = guest ? GUEST_CATEGORIES[guest.category] : null}
      {@const active = selectedSeatId === seat.id || Boolean(guest && selectedGuestId === guest.id)}
      <g
        data-seat-id={seat.id}
        role="button"
        tabindex={active || (!selectedSeatId && i === 0) ? 0 : -1}
        aria-label={`${seat.label}: ${guest?.name ?? 'disponível'}`}
        aria-pressed={active}
        transform={`translate(${seat.x.toFixed(2)} ${seat.y.toFixed(2)}) rotate(${seat.angle.toFixed(1)})`}
        onclick={() => onSeatSelect(seat.id)}
        onkeydown={(event) => seatKey(event, seat)}
        ondragover={(event) => {
          event.preventDefault();
          hovered = seat.id;
        }}
        ondragleave={() => (hovered = null)}
        ondrop={(event) => dropGuest(event, seat.id)}
      >
        <title>{seat.label}{guest ? ` — ${guest.name}` : ' — disponível'}</title>
        <rect x="-34" y="-41" width="68" height="85" fill="transparent" />
        {#if active || hovered === seat.id}<rect
            class="selection-ring"
            x="-32"
            y="-37"
            width="64"
            height="78"
            rx="13"
            fill="#eaf1e9"
            stroke="#295842"
            stroke-width="2"
            stroke-dasharray={hovered === seat.id ? '0' : '4 4'}
          />{/if}
        <rect x="-25" y="-27" width="50" height="9" rx="3" fill={category?.stroke ?? '#ccd4c8'} />
        <rect
          x="-25"
          y="-19"
          width="50"
          height="51"
          rx="8"
          fill={category?.fill ?? '#fffefb'}
          stroke={category?.stroke ?? '#b7c4b3'}
          stroke-width={active ? 2 : 1.4}
        />
        <path d="M -23 22 H 23" stroke={category?.stroke ?? '#d8ded3'} />
        {#if guest}
          {@const first = guest.name.trim().split(/\s+/)[0]}
          <text x="0" y="1" text-anchor="middle" fill={category?.text} class="guest-name"
            >{first.length > 10 ? `${first.slice(0, 9)}…` : first}</text
          >
          <text x="0" y="17" text-anchor="middle" fill={category?.text} class="seat-number"
            >{seat.rowIndex + 1} · {seat.index + 1}</text
          >
        {:else}
          <text x="0" y="5" text-anchor="middle" fill="#758473" class="empty-seat"
            >{String(seat.index + 1).padStart(2, '0')}</text
          >
        {/if}
      </g>
    {/each}
    <text x={geometry.center} y={geometry.height - 15} text-anchor="middle" class="entry"
      >ENTRADA</text
    >
  </svg>
</div>

<style>
  .map-viewport {
    min-height: 0;
    flex: 1;
    overflow: auto;
    display: grid;
    align-items: center;
    background: #fffefb;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .ceremony-map {
    display: block;
    max-height: none;
    margin: auto;
    user-select: none;
  }
  .ceremony-map.fit {
    width: 100%;
    height: 100%;
    max-height: 100%;
  }
  g[role='button'] {
    cursor: pointer;
    outline: none;
  }
  g[role='button']:focus-visible > rect:nth-of-type(1) {
    fill: #dcebdd;
    stroke: #295842;
    stroke-width: 2;
  }
  g[role='button']:hover {
    filter: brightness(0.97);
  }
  text {
    font-family: 'Segoe UI', system-ui, sans-serif;
    pointer-events: none;
  }
  .altar {
    font-size: 12px;
    fill: #496a50;
    font-weight: 650;
    letter-spacing: 2px;
  }
  .aisle {
    fill: #737e6c;
    font-size: 10px;
    letter-spacing: 1.2px;
  }
  .side {
    fill: #6d7b69;
    font-size: 10px;
    letter-spacing: 2px;
  }
  .guest-name {
    font-size: 10px;
    font-weight: 650;
  }
  .seat-number {
    font-size: 8px;
  }
  .empty-seat {
    font-size: 10px;
  }
  .entry {
    fill: #737e6c;
    font-size: 10px;
    letter-spacing: 2px;
  }
  @media print {
    .map-viewport {
      overflow: visible;
      display: block;
    }
    .ceremony-map {
      width: 100% !important;
      height: auto !important;
      min-width: 0 !important;
      max-height: 230mm;
    }
    .selection-ring {
      display: none;
    }
  }
</style>
