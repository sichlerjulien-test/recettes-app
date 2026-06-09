import { describe, expect, it } from 'vitest';
import type { AllergenViolation, Planning } from '../types/domain';
import { recettesMap } from '../../../tests/fixtures/recettes';
import {
  participantAllergiesMultiples,
  participantCoeliaque,
  participantCoeliaqueVegan,
  participantSansContrainte,
  participantVegan,
} from '../../../tests/fixtures/participants';
import { validatePlanning } from './validator';

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

describe('validatePlanning', () => {

  it('doit retourner valid=true pour un planning sans violation', () => {
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes']);
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('doit emettre une AllergenViolation quand la recette contient un allergene du participant', () => {
    const planning = makePlanning(['pates-bolognaise']); // gluten
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque]);
    expect(result.valid).toBe(false);
    const v = result.violations[0];
    expect(v?.kind).toBe('allergen');
    if (v?.kind === 'allergen') {
      expect(v.allergene).toBe('gluten');
      expect(v.recette_id).toBe('pates-bolognaise');
      expect(v.participant_id).toBe(participantCoeliaque.id);
      expect(v.participant_nom).toBe(participantCoeliaque.nom);
    }
  });

  it('doit emettre une violation par allergene croise (gluten+lait pour allergies multiples)', () => {
    // participantAllergiesMultiples: gluten, lait, fruits-coque, arachides
    // carbonara-classique: gluten, lait, oeufs -> 2 croisements
    const planning = makePlanning(['carbonara-classique']);
    const result = validatePlanning(planning, recettesMap, [participantAllergiesMultiples]);
    expect(result.valid).toBe(false);
    const allergenViolations = result.violations
      .filter((v): v is AllergenViolation => v.kind === 'allergen');
    const allergenes = allergenViolations.map((v) => v.allergene);
    expect(allergenes).toContain('gluten');
    expect(allergenes).toContain('lait');
    expect(allergenViolations).toHaveLength(2);
  });

  it('doit emettre une RecetteInconnueViolation pour une recette absente du catalogue', () => {
    const planning = makePlanning(['recette-fantome-xyz']);
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte]);
    expect(result.valid).toBe(false);
    const v = result.violations.find((v) => v.kind === 'recette_inconnue');
    expect(v).toBeDefined();
    if (v?.kind === 'recette_inconnue') {
      expect(v.recette_id).toBe('recette-fantome-xyz');
      expect(v.participant_id).toBeUndefined();
      expect(v.participant_nom).toBeUndefined();
    }
  });

  it('doit retourner valid=true pour un participant sans contrainte sur des recettes avec allergenes', () => {
    const planning = makePlanning(['carbonara-classique', 'pad-thai', 'quiche-lorraine']);
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('doit emettre 2 AllergenViolations quand 2 participants distincts ont le meme allergene gluten', () => {
    const planning = makePlanning(['pates-bolognaise']); // gluten
    const result = validatePlanning(planning, recettesMap, [
      participantCoeliaque,
      participantCoeliaqueVegan,
    ]);
    expect(result.valid).toBe(false);
    const glutenViolations = result.violations
      .filter((v): v is AllergenViolation => v.kind === 'allergen' && v.allergene === 'gluten');
    expect(glutenViolations).toHaveLength(2);
    const ids = glutenViolations.map((v) => v.participant_id);
    expect(ids).toContain(participantCoeliaque.id);
    expect(ids).toContain(participantCoeliaqueVegan.id);
  });

  it("doit n'emettre qu'une seule RecetteInconnueViolation quand la meme id apparait plusieurs fois", () => {
    const planning = makePlanning(['recette-fantome', 'recette-fantome', 'recette-fantome']);
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte]);
    const unknownViolations = result.violations.filter((v) => v.kind === 'recette_inconnue');
    expect(unknownViolations).toHaveLength(1);
  });

  it('doit retourner valid=true pour un participant vegan sans violations allergene', () => {
    // validatePlanning ne valide plus les régimes — seules les allergies comptent ici
    const planning = makePlanning(['salade-tomate-basilic']); // vegan, sans allergène commun
    const result = validatePlanning(planning, recettesMap, [participantVegan]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('doit emettre allergen(gluten) pour un participant coeliaque-vegan sur une recette avec gluten', () => {
    // validatePlanning ne valide que les allergènes — le régime vegan est validé par validateDietary
    const planning = makePlanning(['pates-bolognaise']); // gluten
    const result = validatePlanning(planning, recettesMap, [participantCoeliaqueVegan]);
    expect(result.valid).toBe(false);
    const kinds = result.violations.map((v) => v.kind);
    expect(kinds).toContain('allergen');
    // pas de regime ici — c'est validateDietary qui l'émet
    expect(kinds).not.toContain('regime');
  });

  it('doit retourner valid=true pour un planning vide', () => {
    const planning = makePlanning([]);
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

});
