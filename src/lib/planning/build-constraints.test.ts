import { describe, it, expect } from 'vitest';
import { buildPlanningConstraints } from './build-constraints';
import type { Sejour } from '../types/domain';

const BASE_SEJOUR: Sejour = {
  id: 'sejour-1',
  token: 'tok',
  nom: 'Test',
  nb_jours: 2,
  repartition_repas: { premier_repas: 'midi', midis: 2, soirs: 2, brunchs: 0, slots_resto: [] },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['plaque'],
    temps_disponible: 'standard',
  },
  cree_le: '2026-01-01T00:00:00.000Z',
};

describe('buildPlanningConstraints', () => {
  it('union sur tous les participants — exclusion d\'un, allergène de l\'autre', () => {
    const sejour: Sejour = {
      ...BASE_SEJOUR,
      participants: [
        { id: 'p1', nom: 'Alice', allergies: [], exclusions: ['vegetarien'], aime: [], n_aime_pas: [] },
        { id: 'p2', nom: 'Bob', allergies: ['arachides'], exclusions: [], aime: [], n_aime_pas: [] },
      ],
    };

    const constraints = buildPlanningConstraints(sejour);

    expect(constraints.exclusions_groupe).toContain('vegetarien');
    expect(constraints.allergenes_groupe).toContain('arachides');
  });

  it('déduplication — allergène partagé par deux participants apparaît une seule fois', () => {
    const sejour: Sejour = {
      ...BASE_SEJOUR,
      participants: [
        { id: 'p1', nom: 'Alice', allergies: ['gluten'], exclusions: [], aime: [], n_aime_pas: [] },
        { id: 'p2', nom: 'Bob', allergies: ['gluten'], exclusions: [], aime: [], n_aime_pas: [] },
      ],
    };

    const constraints = buildPlanningConstraints(sejour);

    expect(constraints.allergenes_groupe.filter((a) => a === 'gluten')).toHaveLength(1);
  });

  it('équipement — passthrough depuis sejour.parametres.equipement_disponible', () => {
    const sejour: Sejour = {
      ...BASE_SEJOUR,
      parametres: { ...BASE_SEJOUR.parametres, equipement_disponible: ['plaque', 'four'] },
    };

    const constraints = buildPlanningConstraints(sejour);

    expect(constraints.equipement_disponible).toEqual(['plaque', 'four']);
  });
});
