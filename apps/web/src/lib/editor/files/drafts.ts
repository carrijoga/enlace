import {
  ceremonyProjectSchema,
  parseProjectFile,
  projectDocumentSchema,
  type CeremonyProject,
} from '@enlace/contracts';

export const DRAFT_KEY = 'enlace:draft:anonymous:v1';

export function accountDraftKey(userId: string, projectId: string) {
  return `enlace:draft:account:v1:${userId}:${projectId}`;
}

export type AccountDraft = {
  baseRevision: number;
  project: CeremonyProject;
  dirty?: boolean;
  pending?: { expectedRevision: number; operationId: string; project: CeremonyProject };
};

export function loadAccountDraft(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): AccountDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const data = JSON.parse(raw) as AccountDraft;
  if (!Number.isSafeInteger(data.baseRevision) || data.baseRevision < 1)
    throw new Error('Rascunho da conta inválido.');
  const project = ceremonyProjectSchema.parse(data.project);
  if (data.pending) {
    if (
      data.pending.expectedRevision !== data.baseRevision ||
      !/^[0-9a-f-]{36}$/i.test(data.pending.operationId)
    )
      throw new Error('Rascunho pendente inválido.');
    ceremonyProjectSchema.parse(data.pending.project);
  }
  return { ...data, dirty: data.dirty === true, project };
}

export function saveAccountDraft(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  draft: AccountDraft,
) {
  const value: AccountDraft = {
    baseRevision: draft.baseRevision,
    project: ceremonyProjectSchema.parse(draft.project),
    dirty: draft.dirty === true,
    ...(draft.pending
      ? {
          pending: {
            ...draft.pending,
            project: ceremonyProjectSchema.parse(draft.pending.project),
          },
        }
      : {}),
  };
  storage.setItem(key, JSON.stringify(value));
}

export function clearAccountDraft(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem' | 'setItem'>,
  userId: string,
) {
  const prefix = `enlace:draft:account:v1:${userId}:`;
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
  storage.removeItem(`enlace:pending-create:v1:${userId}`);
  try {
    storage.setItem(`enlace:account-logout:v1:${userId}`, String(Date.now()));
  } catch {
    // Per-project keys were already removed if this notification cannot be written.
  }
}

export type DraftLoadResult =
  | { status: 'empty' }
  | { status: 'ready'; project: CeremonyProject; savedAt: string }
  | { status: 'corrupt'; raw: string }
  | { status: 'unavailable' };

export function loadDraft(storage: Pick<Storage, 'getItem'>): DraftLoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  try {
    const document = parseProjectFile(raw);
    return { status: 'ready', project: document.project, savedAt: document.exportedAt };
  } catch {
    return { status: 'corrupt', raw };
  }
}

export function saveDraft(
  storage: Pick<Storage, 'setItem'>,
  project: CeremonyProject,
): { savedAt: string } {
  const savedAt = new Date().toISOString();
  const document = projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 1,
    exportedAt: savedAt,
    project: ceremonyProjectSchema.parse(project),
  });
  storage.setItem(DRAFT_KEY, JSON.stringify(document));
  return { savedAt };
}
