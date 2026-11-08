import { describe, expect, it } from 'vitest';
import {
  addGuest,
  addGuests,
  addRow,
  assignGuest,
  createInitialProject,
  createSampleProject,
  getGuestSeatId,
  getLayoutGeometry,
  getSeatLabel,
  getSeatLabels,
  removeRow,
  setLayout,
  setRowCount,
  unassignSeat,
} from '../src/index.js';

const guest = (name = 'Pessoa') => ({
  id: crypto.randomUUID(),
  name,
  category: 'convidado' as const,
  note: '',
});
const seats = (project: ReturnType<typeof createInitialProject>) =>
  project.layout.rows.flatMap((row) => [...row.leftSeatIds, ...row.rightSeatIds]);

describe('domain project commands', () => {
  it('creates 55 seats, and sample data is fictional with valid assignments', () => {
    const initial = createInitialProject();
    expect(seats(initial)).toHaveLength(55);
    expect(createSampleProject().guests).toHaveLength(10);
    expect(createSampleProject().assignments.length).toBeGreaterThan(0);
  });

  it('preserves chair IDs when changing layout and resizing counts', () => {
    const project = createInitialProject();
    const original = project.layout.rows[0]!;
    const resized = setRowCount(project, original.id, 'left', 4);
    expect(resized.layout.rows[0]!.leftSeatIds).toEqual(original.leftSeatIds.slice(0, 4));
    expect(resized.layout.rows[0]!.rightSeatIds).toHaveLength(4);
    expect(setLayout(resized, { mode: 'curve', aisleWidth: 3 }).layout.rows[0]!.id).toBe(
      original.id,
    );
    expect(project.layout.rows[0]!.leftSeatIds).toHaveLength(6);
  });

  it('moves, swaps, displaces, and unassigns while keeping single occupancy', () => {
    let p = createInitialProject();
    const [a, b, c] = [guest('A'), guest('B'), guest('C')];
    p = addGuest(addGuest(addGuest(p, a), b), c);
    const [s1, s2] = seats(p);
    p = assignGuest(assignGuest(p, a.id, s1!), b.id, s2!);
    p = assignGuest(p, a.id, s2!);
    expect(getGuestSeatId(p, a.id)).toBe(s2);
    expect(getGuestSeatId(p, b.id)).toBe(s1);
    const beforeSelfAssign = p.assignments.length;
    p = assignGuest(p, a.id, s2!);
    expect(p.assignments).toHaveLength(beforeSelfAssign);
    p = assignGuest(p, c.id, s2!);
    expect(getGuestSeatId(p, a.id)).toBeUndefined();
    expect(getGuestSeatId(p, c.id)).toBe(s2);
    p = unassignSeat(p, s1!);
    expect(p.assignments.map((x) => x.seatId)).toEqual([s2]);
  });

  it('removing a middle row removes its assignments but keeps other row IDs', () => {
    let p = createInitialProject();
    const g = guest();
    p = addGuest(p, g);
    const first = p.layout.rows[0]!,
      middle = p.layout.rows[2]!,
      last = p.layout.rows[4]!;
    p = assignGuest(p, g.id, middle.leftSeatIds[0]!);
    p = removeRow(p, middle.id);
    expect(p.layout.rows.map((r) => r.id)).toEqual([
      first.id,
      p.layout.rows[1]!.id,
      p.layout.rows[2]!.id,
      last.id,
    ]);
    expect(p.assignments).toEqual([]);
    expect(() => removeRow(p, 'missing')).toThrow();
  });

  it('keeps guests when count reduction removes their seat assignment', () => {
    let p = createInitialProject();
    const g = guest();
    p = addGuest(p, g);
    const row = p.layout.rows[0]!;
    p = assignGuest(p, g.id, row.leftSeatIds[5]!);
    p = setRowCount(p, row.id, 'left', 2);
    expect(p.guests).toContainEqual(g);
    expect(p.assignments).toEqual([]);
  });

  it('rejects invalid input without mutating the original and enforces limits', () => {
    const p = createInitialProject();
    expect(() => setRowCount(p, p.layout.rows[0]!.id, 'left', Number.NaN)).toThrow();
    expect(() => addGuest(p, { ...guest(), category: 'unknown' as never })).toThrow();
    expect(p.guests).toHaveLength(0);
    let max = p;
    while (max.layout.rows.length < 12) max = addRow(max);
    max = setLayout(max, { linkedCounts: false });
    for (const row of max.layout.rows) {
      max = setRowCount(max, row.id, 'left', 12);
      max = setRowCount(max, row.id, 'right', 12);
    }
    expect(seats(max)).toHaveLength(288);
    expect(() => addRow(max)).toThrow();
    expect(() =>
      addGuest({ ...max, guests: Array.from({ length: 300 }, guest) }, guest()),
    ).toThrow();
  });

  it('returns finite geometry for straight and curved extremes and clear labels', () => {
    let p = createInitialProject();
    p = setLayout(p, { mode: 'curve', curveStrength: 100, aisleWidth: 3, linkedCounts: false });
    p = setRowCount(p, p.layout.rows[0]!.id, 'left', 12);
    const geometry = getLayoutGeometry(p.layout);
    expect(geometry.width).toBeGreaterThanOrEqual(1180);
    expect(geometry.height).toBeGreaterThanOrEqual(825);
    expect(geometry.seats.every((seat) => Number.isFinite(seat.x + seat.y + seat.angle))).toBe(
      true,
    );
    expect(getSeatLabel(p, geometry.seats[0]!.id)).toContain('Fileira 1 · esquerda · cadeira 1');
  });

  it('matches the original arc direction, symmetry, and 150px rise cap', () => {
    let p = setLayout(createInitialProject(), {
      mode: 'curve',
      curveStrength: 65,
      linkedCounts: false,
    });
    const row = p.layout.rows[0]!;
    p = setRowCount(p, row.id, 'left', 12);
    p = setRowCount(p, row.id, 'right', 12);
    const geometry = getLayoutGeometry(p.layout);
    const left = geometry.seats.filter((seat) => seat.rowId === row.id && seat.side === 'left');
    const right = geometry.seats.filter((seat) => seat.rowId === row.id && seat.side === 'right');
    expect(left.at(-1)!.y).toBeLessThan(left[0]!.y - 20);
    expect(left.at(-1)!.y).toBe(right.at(-1)!.y);
    expect(left[0]!.x + right[0]!.x).toBe(2 * geometry.center);
    expect(left.at(-1)!.angle).toBeGreaterThan(0);
    expect(right.at(-1)!.angle).toBeLessThan(0);
    expect(left[0]!.y - left.at(-1)!.y).toBeCloseTo(150, 5);
  });

  it('rejects invalid runtime side values', () => {
    const p = createInitialProject();
    expect(() => setRowCount(p, p.layout.rows[0]!.id, 'center' as never, 2)).toThrow();
  });
});

describe('structural sharing and seat labels', () => {
  it('keeps unchanged guests, rows and assignments by reference after a command', () => {
    const p = createSampleProject();
    const next = setLayout(p, { mode: 'curve' });
    expect(next).not.toBe(p);
    expect(next.guests).toBe(p.guests);
    expect(next.assignments).toBe(p.assignments);
    expect(next.layout.rows).toBe(p.layout.rows);
    const moved = assignGuest(p, p.guests[9]!.id, seats(p).at(-1)!);
    expect(moved.guests).toBe(p.guests);
    expect(moved.guests[0]).toBe(p.guests[0]);
  });

  it('returns the same project when a guest is assigned to the seat they already hold', () => {
    const p = createSampleProject();
    const { guestId, seatId } = p.assignments[0]!;
    expect(assignGuest(p, guestId, seatId)).toBe(p);
  });

  it('still rejects invalid results even though it returns the input object', () => {
    const p = createSampleProject();
    expect(() => addGuest(p, { ...guest(), name: '   ' })).toThrow();
    expect(() => addGuest(p, { ...guest(), id: p.guests[0]!.id })).toThrow();
  });

  it('labels every seat exactly like getSeatLabel', () => {
    const base = createInitialProject();
    const p = setRowCount(base, base.layout.rows[0]!.id, 'left', 3);
    const labels = getSeatLabels(p.layout);
    expect(labels.size).toBe(seats(p).length);
    for (const id of seats(p)) expect(labels.get(id)).toBe(getSeatLabel(p, id));
  });

  it('adds a guest batch in one change without touching layout or seats, within limits', () => {
    const p = createInitialProject();
    const batch = [guest('Ana Fictícia'), guest('Ana Fictícia'), guest('Bruno')];
    const next = addGuests(p, batch);
    expect(next.guests.map((g) => g.name)).toEqual(['Ana Fictícia', 'Ana Fictícia', 'Bruno']);
    expect(next.layout).toBe(p.layout);
    expect(next.assignments).toEqual([]);
    expect(addGuests(p, [])).toBe(p);
    const full = addGuests(
      p,
      Array.from({ length: 300 }, () => guest()),
    );
    expect(() => addGuests(full, [guest()])).toThrow(/300/);
    const dup = guest();
    expect(() => addGuests(p, [dup, dup])).toThrow();
  });
});
