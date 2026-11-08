import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDemoDocument,
  createProjectRequestSchema,
  saveProjectRequestSchema,
  deleteProjectRequestSchema,
} from '../src/index.js';

describe('contratos de persistência', () => {
  it('recusa identidade/propriedade e revisões impostas pelo cliente', () => {
    const input = {
      id: randomUUID(),
      operationId: randomUUID(),
      project: createDemoDocument().project,
    };
    expect(createProjectRequestSchema.safeParse(input).success).toBe(true);
    expect(createProjectRequestSchema.safeParse({ ...input, ownerId: 'outra-conta' }).success).toBe(
      false,
    );
    expect(createProjectRequestSchema.safeParse({ ...input, revision: 10 }).success).toBe(false);
  });
  it('valida revisão esperada, operação e integridade do agregado', () => {
    const input = {
      expectedRevision: 1,
      operationId: randomUUID(),
      project: createDemoDocument().project,
    };
    expect(saveProjectRequestSchema.safeParse(input).success).toBe(true);
    for (const expectedRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(saveProjectRequestSchema.safeParse({ ...input, expectedRevision }).success).toBe(
        false,
      );
      expect(deleteProjectRequestSchema.safeParse({ expectedRevision }).success).toBe(false);
    }
    input.project.assignments.push({ seatId: randomUUID(), guestId: randomUUID() });
    expect(saveProjectRequestSchema.safeParse(input).success).toBe(false);
  });
});
