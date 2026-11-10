import {
  projectSchema,
  parseProjectFile,
  projectDocumentSchema,
  type Project,
} from '@enlace/contracts';

export const DRAFT_KEY = 'enlace:draft:anonymous:v1';

export function accountDraftKey(userId: string, projectId: string) {
  return `enlace:draft:account:v1:${userId}:${projectId}`;
}

export type AccountDraft = {
  baseRevision: number;
  project: Project;
  dirty?: boolean;
  pending?: { expectedRevision: number; operationId: string; project: Project };
};

// Rascunhos de conta salvos antes da virada para o contrato v2 não têm a chave
// `reception` (o projeto do servidor naquela revisão não tinha plano da festa).
// Só aqui a ausência da chave vale como `null`; uma recepção presente e inválida
// continua sendo rejeitada pelo schema.
function parseDraftProject(value: unknown): Project {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('reception' in value)
  )
    return projectSchema.parse({ ...value, reception: null });
  return projectSchema.parse(value);
}

export function loadAccountDraft(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): AccountDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const data = JSON.parse(raw) as AccountDraft;
  if (!Number.isSafeInteger(data.baseRevision) || data.baseRevision < 1)
    throw new Error('Rascunho da conta inválido.');
  const project = parseDraftProject(data.project);
  let pending: AccountDraft['pending'];
  if (data.pending) {
    if (
      data.pending.expectedRevision !== data.baseRevision ||
      !/^[0-9a-f-]{36}$/i.test(data.pending.operationId)
    )
      throw new Error('Rascunho pendente inválido.');
    pending = { ...data.pending, project: parseDraftProject(data.pending.project) };
  }
  return { ...data, dirty: data.dirty === true, project, ...(pending ? { pending } : {}) };
}

export function saveAccountDraft(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  draft: AccountDraft,
) {
  const value: AccountDraft = {
    baseRevision: draft.baseRevision,
    project: projectSchema.parse(draft.project),
    dirty: draft.dirty === true,
    ...(draft.pending
      ? {
          pending: {
            ...draft.pending,
            project: projectSchema.parse(draft.pending.project),
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
  storage.removeItem(`enlace:pending-import:v1:${userId}`);
  try {
    storage.setItem(`enlace:account-logout:v1:${userId}`, String(Date.now()));
  } catch {
    // Per-project keys were already removed if this notification cannot be written.
  }
}

export type DraftLoadResult =
  | { status: 'empty' }
  | { status: 'ready'; project: Project; savedAt: string }
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
  project: Project,
): { savedAt: string } {
  const savedAt = new Date().toISOString();
  const document = projectDocumentSchema.parse({
    format: 'enlace-project',
    schemaVersion: 2,
    exportedAt: savedAt,
    project: projectSchema.parse(project),
  });
  storage.setItem(DRAFT_KEY, JSON.stringify(document));
  return { savedAt };
}
