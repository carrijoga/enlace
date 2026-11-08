import { describe, expect, it } from 'vitest';
import { createDemoDocument } from '@enlace/contracts';
import { DRAFT_KEY, loadDraft, saveDraft } from './drafts.js';

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
