import { describe, expect, it } from 'vitest';
import { parseProjectFile, projectSchema } from '@enlace/contracts';
import {
  addGuest,
  addGuestCategory,
  assignGuest,
  countGuestsInCategory,
  createInitialProject,
  removeGuestCategory,
  toSharedView,
  updateGuest,
  updateGuestCategory,
} from '../src/index.js';

const guest = (name: string, category = 'convidado') => ({
  id: crypto.randomUUID(),
  name,
  category,
  note: '',
});

function withCategory() {
  const project = addGuestCategory(createInitialProject(), {
    label: '  Amigos   da faculdade ',
    color: 'azul',
  });
  return { project, id: project.guestCategories[0]!.id };
}

describe('categorias personalizadas de convidado', () => {
  it('cria com o nome aparado e permite usar a categoria nos convidados', () => {
    const { project, id } = withCategory();
    expect(project.guestCategories).toEqual([{ id, label: 'Amigos da faculdade', color: 'azul' }]);
    const next = addGuest(project, guest('Ana Fictícia', id));
    expect(next.guests[0]!.category).toBe(id);
    expect(countGuestsInCategory(next, id)).toBe(1);
  });

  it('recusa nome vazio, repetido ou igual a uma categoria padrão, sem acento nem caixa', () => {
    const { project } = withCategory();
    expect(() => addGuestCategory(project, { label: '   ', color: 'rosa' })).toThrow('nome');
    expect(() =>
      addGuestCategory(project, { label: 'AMIGOS DA FACULDADE', color: 'rosa' }),
    ).toThrow('Já existe');
    expect(() => addGuestCategory(project, { label: 'familia', color: 'rosa' })).toThrow(
      'Já existe',
    );
  });

  it('renomeia e troca a cor, inclusive mantendo o próprio nome', () => {
    const { project, id } = withCategory();
    const next = updateGuestCategory(project, id, { label: 'Amigos da Faculdade', color: 'oliva' });
    expect(next.guestCategories[0]).toEqual({ id, label: 'Amigos da Faculdade', color: 'oliva' });
  });

  it('ao excluir, quem estava nela vira Convidado e continua na cadeira', () => {
    const { project, id } = withCategory();
    const person = guest('Bruno Exemplo', id);
    let next = addGuest(project, person);
    next = assignGuest(next, person.id, next.layout.rows[0]!.leftSeatIds[0]!);
    next = removeGuestCategory(next, id);
    expect(next.guestCategories).toEqual([]);
    expect(next.guests[0]!.category).toBe('convidado');
    expect(next.assignments).toHaveLength(1);
  });

  it('recusa convidado em categoria inexistente', () => {
    const project = createInitialProject();
    expect(() => addGuest(project, guest('Carla', crypto.randomUUID()))).toThrow();
    const { project: withOne, id } = withCategory();
    const person = guest('Diego');
    const added = addGuest(withOne, person);
    expect(() => updateGuest(added, person.id, { category: 'inexistente' as never })).toThrow();
    expect(updateGuest(added, person.id, { category: id }).guests[0]!.category).toBe(id);
  });

  it('lê arquivos anteriores às categorias com lista vazia', () => {
    const legacy: Record<string, unknown> = { ...createInitialProject() };
    delete legacy.guestCategories;
    expect(projectSchema.parse(legacy).guestCategories).toEqual([]);
    const file = parseProjectFile(
      JSON.stringify({
        format: 'enlace-project',
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        project: legacy,
      }),
    );
    expect(file.project.guestCategories).toEqual([]);
  });

  it('a visualização com nomes leva só as categorias de quem tem cadeira', () => {
    const { project: base, id } = withCategory();
    let project = addGuestCategory(base, { label: 'Trabalho', color: 'rosa' });
    const person = guest('Elisa Amostra', id);
    project = addGuest(project, person);
    project = assignGuest(project, person.id, project.layout.rows[0]!.leftSeatIds[0]!);
    const view = toSharedView(project, 'names');
    if (view.mode !== 'names') throw new Error('modo inesperado');
    expect(view.guestCategories).toEqual([{ id, label: 'Amigos da faculdade', color: 'azul' }]);
    expect(view.seats[0]!.category).toBe(id);
    expect(toSharedView(project, 'plan')).not.toHaveProperty('guestCategories');
  });
});
