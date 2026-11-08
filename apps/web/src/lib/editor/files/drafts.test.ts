import { describe, expect, it } from 'vitest';
import { createDemoDocument } from '@enlace/contracts';
import { DRAFT_KEY, clearAccountDraft, loadDraft, saveDraft } from './drafts.js';

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
