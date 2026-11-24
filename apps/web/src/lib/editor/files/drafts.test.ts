import { describe, expect, it } from 'vitest';
import { createDemoDocument } from '@enlace/contracts';
import { addTable, createRectangleOutline, setRoomOutline } from '@enlace/domain/reception';
import {
  DRAFT_KEY,
  accountDraftKey,
  clearAccountDraft,
  loadAccountDraft,
  loadDraft,
  saveAccountDraft,
  saveDraft,
} from './drafts.js';

function projectWithReception() {
  return addTable(
    setRoomOutline(createDemoDocument().project, createRectangleOutline(2000, 1000)),
    {},
  );
}

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

it('ao sair remove só dados da conta atual, incluindo importação ambígua, e avisa outras abas', () => {
  const store = new Map([
    [DRAFT_KEY, 'anônimo'],
    ['enlace:draft:account:v1:alice:project', 'privado'],
    ['enlace:draft:account:v1:bob:project', 'outra conta'],
    ['enlace:pending-create:v1:alice', 'criação'],
    ['enlace:pending-import:v1:alice', 'importação'],
  ]);
  clearAccountDraft(
    {
      get length() {
        return store.size;
      },
      key: (index) => [...store.keys()][index] ?? null,
      removeItem: (key) => {
        store.delete(key);
      },
      setItem: (key, value) => {
        store.set(key, value);
      },
    },
    'alice',
  );
  expect([...store.keys()]).toEqual([
    DRAFT_KEY,
    'enlace:draft:account:v1:bob:project',
    'enlace:account-logout:v1:alice',
  ]);
});

describe('drafts locais anônimos', () => {
  it('distingue armazenamento vazio, indisponível e conteúdo corrompido', () => {
    expect(loadDraft({ getItem: () => null })).toEqual({ status: 'empty' });
    expect(loadDraft({ getItem: () => '{quebrado' })).toEqual({
      status: 'corrupt',
      raw: '{quebrado',
    });
    expect(
      loadDraft({
        getItem: () => {
          throw new Error('bloqueado');
        },
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('salva e carrega um envelope válido sem gravar durante a leitura', () => {
    const store = new Map<string, string>();
    let writes = 0;
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes += 1;
        store.set(key, value);
      },
    };
    const project = createDemoDocument().project;
    expect(loadDraft(storage)).toEqual({ status: 'empty' });
    expect(writes).toBe(0);
    const { savedAt } = saveDraft(storage, project);
    const loaded = loadDraft(storage);
    expect(DRAFT_KEY).toBe('enlace:draft:anonymous:v1');
    expect(loaded).toEqual({ status: 'ready', project, savedAt });
    expect(writes).toBe(1);
  });

  it('propaga erro de quota do armazenamento', () => {
    expect(() =>
      saveDraft(
        {
          setItem: () => {
            throw new DOMException('cheio', 'QuotaExceededError');
          },
        },
        createDemoDocument().project,
      ),
    ).toThrow('cheio');
  });
});

describe('drafts no contrato v2', () => {
  it('grava o rascunho anônimo como documento schemaVersion 2', () => {
    const storage = memoryStorage();
    saveDraft(storage, createDemoDocument().project);
    const saved = JSON.parse(storage.store.get(DRAFT_KEY)!);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.project.reception).toBeNull();
  });

  it('migra um rascunho anônimo v1 com reception nula', () => {
    const ceremony: Record<string, unknown> = { ...createDemoDocument().project };
    delete ceremony.reception;
    const storage = memoryStorage();
    storage.store.set(
      DRAFT_KEY,
      JSON.stringify({
        format: 'enlace-project',
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        project: ceremony,
      }),
    );
    const loaded = loadDraft(storage);
    expect(loaded.status).toBe('ready');
    if (loaded.status === 'ready') expect(loaded.project.reception).toBeNull();
  });

  it('preserva uma recepção não nula na ida e volta do rascunho anônimo', () => {
    const storage = memoryStorage();
    const project = projectWithReception();
    expect(project.reception).not.toBeNull();
    const { savedAt } = saveDraft(storage, project);
    expect(loadDraft(storage)).toEqual({ status: 'ready', project, savedAt });
  });

  it('carrega rascunho de conta antigo sem a chave reception como null', () => {
    const ceremony: Record<string, unknown> = { ...createDemoDocument().project };
    delete ceremony.reception;
    const storage = memoryStorage();
    const key = accountDraftKey('u', 'p');
    storage.store.set(
      key,
      JSON.stringify({
        baseRevision: 3,
        project: ceremony,
        pending: {
          expectedRevision: 3,
          operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          project: ceremony,
        },
      }),
    );
    const draft = loadAccountDraft(storage, key)!;
    expect(draft.project.reception).toBeNull();
    expect(draft.pending!.project.reception).toBeNull();
  });

  it('rejeita rascunho de conta com recepção inválida', () => {
    const storage = memoryStorage();
    const key = accountDraftKey('u', 'p');
    storage.store.set(
      key,
      JSON.stringify({
        baseRevision: 1,
        project: { ...createDemoDocument().project, reception: { room: 'inválida' } },
      }),
    );
    expect(() => loadAccountDraft(storage, key)).toThrow();
  });

  it('preserva a recepção na ida e volta do rascunho de conta', () => {
    const storage = memoryStorage();
    const key = accountDraftKey('u', 'p');
    const project = projectWithReception();
    saveAccountDraft(storage, key, { baseRevision: 2, project, dirty: true });
    expect(loadAccountDraft(storage, key)!.project).toEqual(project);
  });
});
