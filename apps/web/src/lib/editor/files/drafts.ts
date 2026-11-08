import {
  ceremonyProjectSchema,
  parseProjectFile,
  projectDocumentSchema,
  type CeremonyProject,
} from '@enlace/contracts';

export const DRAFT_KEY = 'enlace:draft:anonymous:v1';

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
