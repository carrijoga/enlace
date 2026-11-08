import { describe, expect, it, vi } from 'vitest';
import { selectWriteRequest, stateAfterAcknowledgement, writesBlocked } from './remote-sync';

describe('remote save coordination', () => {
  it('reuses the exact operation after an ambiguous failure', () => {
    const retry = { expectedRevision: 7, operationId: 'same-operation', project: { title: 'A' } };
    const createNew = vi.fn(() => ({
      expectedRevision: 8,
      operationId: 'new-operation',
      project: { title: 'B' },
    }));
    expect(selectWriteRequest(retry, createNew)).toBe(retry);
    expect(createNew).not.toHaveBeenCalled();
  });

  it('does not mark newer edits saved when an earlier request is acknowledged', () => {
    const submitted = { title: 'Antes' };
    const current = { title: 'Depois' };
    expect(stateAfterAcknowledgement(current, submitted, (a, b) => a.title === b.title)).toBe(
      'pending',
    );
    expect(stateAfterAcknowledgement(submitted, submitted, (a, b) => a.title === b.title)).toBe(
      'saved',
    );
  });

  it('stops writes after a revision conflict or expired session', () => {
    expect(writesBlocked('conflict')).toBe(true);
    expect(writesBlocked('expired')).toBe(true);
    expect(writesBlocked('pending')).toBe(false);
  });
});
