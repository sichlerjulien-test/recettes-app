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
import { validateDietary } from './validator';

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
    contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
  };
}

describe('validateDietary', () => {

  it('doit retourner [] pour un participant sans régime sur une recette non-vegan', () => {
    const planning = makePlanning(['omelette-legumes']);
    const result = validateDietary(planning, recettesMap, [participantSansContrainte]);
    expect(result).toHaveLength(0);
  });

  it('doit émettre une RegimeViolation kind=vegan quand la recette n\'est pas vegan', () => {
    const planning = makePlanning(['omelette-legumes']); // est_vegan=false
    const result = validateDietary(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('regime');
    expect(result[0]?.regime).toBe('vegan');
    expect(result[0]?.participant_id).toBe(participantVegan.id);
  });

  it('doit émettre une RegimeViolation kind=vegetarien quand la recette contient de la viande', () => {
    const planning = makePlanning(['pates-bolognaise']); // est_vegetarien=false
    const result = validateDietary(planning, recettesMap, [participantVegetarien]);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('regime');
    expect(result[0]?.regime).toBe('vegetarien');
    expect(result[0]?.participant_id).toBe(participantVegetarien.id);
  });

  it('doit retourner [] pour un planning vide', () => {
    const planning = makePlanning([]);
    const result = validateDietary(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(0);
  });

  it('doit ignorer silencieusement une recette inconnue (recette_inconnue est remonté par validatePlanning)', () => {
    const planning = makePlanning(['recette-fantome-xyz']);
    const result = validateDietary(planning, recettesMap, [participantVegan]);
    expect(result).toHaveLength(0);
  });

  it('doit émettre regime(vegan) pour un participant coeliaque-vegan sur une recette non-vegan', () => {
    // participantCoeliaqueVegan : allergies=['gluten'], regimes=['vegan']
    // omelette-legumes est_vegan=false → violation régime 'vegan'
    const planning = makePlanning(['omelette-legumes']);
    const result = validateDietary(planning, recettesMap, [participantCoeliaqueVegan]);
    expect(result).toHaveLength(1);
    expect(result[0]?.regime).toBe('vegan');
    expect(result[0]?.participant_id).toBe(participantCoeliaqueVegan.id);
  });

  it('doit émettre une RegimeViolation végétarien pour participantVegetarienLait (régime + allergie indépendants)', () => {
    // pates-bolognaise : est_vegetarien=false → violation végétarien
    // participantVegetarienLait a aussi allergie lait, mais validateDietary ne gère que les régimes
    const planning = makePlanning(['pates-bolognaise']);
    const result = validateDietary(planning, recettesMap, [participantVegetarienLait]);
    expect(result).toHaveLength(1);
    expect(result[0]?.regime).toBe('vegetarien');
    expect(result[0]?.participant_id).toBe(participantVegetarienLait.id);
  });

  it('doit émettre 2 violations quand 2 participants vegan reçoivent une recette non-vegan', () => {
    const planning = makePlanning(['omelette-legumes']);
    const result = validateDietary(planning, recettesMap, [participantVegan, participantCoeliaqueVegan]);
    expect(result).toHaveLength(2);
    const ids = result.map((v) => v.participant_id);
    expect(ids).toContain(participantVegan.id);
    expect(ids).toContain(participantCoeliaqueVegan.id);
  });

});
