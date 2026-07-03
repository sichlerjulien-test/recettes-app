import { describe, expect, it } from 'vitest';
import type { Planning } from '../types/domain';
import { recettesMap } from '../../../tests/fixtures/recettes';
import {
  participantSansContrainte,
  participantVegan,
  participantVegetarien,
  participantCoeliaqueVegan,
  participantVegetarienLait,
} from '../../../tests/fixtures/participants';
import { validateExclusions } from './validator';

function makePlanning(recetteIds: string[]): Planning {
  return {
    id: 'planning-test',
    sejour_id: 'sejour-test',
    entries: recetteIds.map((recette_id, i) => ({
      jour: Math.floor(i / 2) + 1,
      repas: i % 2 === 0 ? ('midi' as const) : ('soir' as const),
      recette_id,
      portions: 4,
    })),
    genere_le: '2026-04-21T00:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
  };
}

describe('validateExclusions', () => {

  it('doit retourner [] pour un participant sans exclusion sur une recette non-vegan', () => {
    const planning = makePlanning(['omelette-legumes']);
    const result = validateExclusions(planning, recettesMap, [participantSansContrainte]);
    expect(result).toHaveLength(0);
  });

  it('doit émettre une ExclusionViolation kind=exclusion quand la recette n\'est pas vegan', () => {
    const planning = makePlanning(['omelette-legumes']); // exclusions_compatibles n'inclut pas 'vegan'
    const result = validateExclusions(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('exclusion');
    expect(result[0]?.exclusion).toBe('vegan');
    expect(result[0]?.participant_id).toBe(participantVegan.id);
  });

  it('doit émettre une ExclusionViolation kind=exclusion quand la recette contient de la viande', () => {
    const planning = makePlanning(['pates-bolognaise']); // exclusions_compatibles = []
    const result = validateExclusions(planning, recettesMap, [participantVegetarien]);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('exclusion');
    expect(result[0]?.exclusion).toBe('vegetarien');
    expect(result[0]?.participant_id).toBe(participantVegetarien.id);
  });

  it('doit retourner [] pour un planning vide', () => {
    const planning = makePlanning([]);
    const result = validateExclusions(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(0);
  });

  it('doit ignorer silencieusement une recette inconnue (recette_inconnue est remonté par validatePlanning)', () => {
    const planning = makePlanning(['recette-fantome-xyz']);
    const result = validateExclusions(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(0);
  });

  it('doit émettre exclusion(vegan) pour un participant coeliaque-vegan sur une recette non-vegan', () => {
    const planning = makePlanning(['omelette-legumes']);
    const result = validateExclusions(planning, recettesMap, [participantCoeliaqueVegan]);
    expect(result).toHaveLength(1);
    expect(result[0]?.exclusion).toBe('vegan');
    expect(result[0]?.participant_id).toBe(participantCoeliaqueVegan.id);
  });

  it('doit émettre une ExclusionViolation végétarien pour participantVegetarienLait (exclusion + allergie indépendants)', () => {
    const planning = makePlanning(['pates-bolognaise']);
    const result = validateExclusions(planning, recettesMap, [participantVegetarienLait]);
    expect(result).toHaveLength(1);
    expect(result[0]?.exclusion).toBe('vegetarien');
    expect(result[0]?.participant_id).toBe(participantVegetarienLait.id);
  });

  it('doit émettre 2 violations quand 2 participants vegan reçoivent une recette non-vegan', () => {
    const planning = makePlanning(['omelette-legumes']);
    const result = validateExclusions(planning, recettesMap, [participantVegan, participantCoeliaqueVegan]);
    expect(result).toHaveLength(2);
    const ids = result.map((v) => v.participant_id);
    expect(ids).toContain(participantVegan.id);
    expect(ids).toContain(participantCoeliaqueVegan.id);
  });

  // ── Intensif : 100 tirages — jamais de violation après filtrage correct ───────────────────────

  it('intensif : 100 tirages — validateExclusions retourne [] sur recettes vegan pour participants vegan', () => {
    const veganRecettes = [...recettesMap.values()].filter(
      (r) => r.exclusions_compatibles.includes('vegan'),
    );
    const planning: Planning = {
      id: 'planning-intensif',
      sejour_id: 'sejour-intensif',
      entries: veganRecettes.map((r, i) => ({
        jour: i + 1, repas: 'midi' as const, recette_id: r.id, portions: 2,
      })),
      genere_le: '2026-06-10T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: ['vegan'], equipement: [] },
    };
    for (let i = 0; i < 100; i++) {
      const violations = validateExclusions(planning, recettesMap, [participantVegan]);
      expect(violations).toHaveLength(0);
    }
  });

  it('intensif : 100 tirages — validateExclusions retourne [] sur recettes vegetariennes pour participants vegetariens', () => {
    const vegRecettes = [...recettesMap.values()].filter(
      (r) => r.exclusions_compatibles.includes('vegetarien'),
    );
    const planning: Planning = {
      id: 'planning-intensif-veg',
      sejour_id: 'sejour-intensif',
      entries: vegRecettes.map((r, i) => ({
        jour: i + 1, repas: 'midi' as const, recette_id: r.id, portions: 2,
      })),
      genere_le: '2026-06-10T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: ['vegetarien'], equipement: [] },
    };
    for (let i = 0; i < 100; i++) {
      const violations = validateExclusions(planning, recettesMap, [participantVegetarien]);
      expect(violations).toHaveLength(0);
    }
  });

});
