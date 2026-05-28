import { describe, expect, it } from 'vitest';
import type { AllergenViolation, Planning } from '../types/domain';
import { recettesMap } from '../../../tests/fixtures/recettes';
import {
  participantAllergiesMultiples,
  participantCoeliaque,
  participantCoeliaqueVegan,
  participantSansContrainte,
  participantVegan,
  participantVegetarien,
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

/** Dérive les expectedSlots depuis un planning existant (slots_mismatch ne déclenche pas). */
function slotsFrom(planning: Planning) {
  return planning.entries.map((e) => ({ jour: e.jour, repas: e.repas }));
}

describe('validatePlanning', () => {

  it('doit retourner valid=true pour un planning sans violation', () => {
    // omelette-legumes (oeufs) ≠ salade-tomate-basilic (legumes) → pas de conflit de jour
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes']);
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque], slotsFrom(planning));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('doit emettre une AllergenViolation quand la recette contient un allergene du participant', () => {
    const planning = makePlanning(['pates-bolognaise']); // gluten
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque], slotsFrom(planning));
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
    const result = validatePlanning(planning, recettesMap, [participantAllergiesMultiples], slotsFrom(planning));
    expect(result.valid).toBe(false);
    const allergenViolations = result.violations
      .filter((v): v is AllergenViolation => v.kind === 'allergen');
    const allergenes = allergenViolations.map((v) => v.allergene);
    expect(allergenes).toContain('gluten');
    expect(allergenes).toContain('lait');
    expect(allergenViolations).toHaveLength(2);
  });

  it('doit emettre une RegimeViolation kind=vegan quand la recette nest pas vegan', () => {
    const planning = makePlanning(['omelette-legumes']); // est_vegan=false
    const result = validatePlanning(planning, recettesMap, [participantVegan], slotsFrom(planning));
    expect(result.valid).toBe(false);
    const v = result.violations.find((v) => v.kind === 'regime');
    expect(v).toBeDefined();
    if (v?.kind === 'regime') {
      expect(v.regime).toBe('vegan');
      expect(v.participant_id).toBe(participantVegan.id);
    }
  });

  it('doit emettre une RegimeViolation kind=vegetarien quand la recette contient de la viande', () => {
    const planning = makePlanning(['pates-bolognaise']); // est_vegetarien=false
    const result = validatePlanning(planning, recettesMap, [participantVegetarien], slotsFrom(planning));
    expect(result.valid).toBe(false);
    const v = result.violations.find((v) => v.kind === 'regime');
    expect(v).toBeDefined();
    if (v?.kind === 'regime') {
      expect(v.regime).toBe('vegetarien');
      expect(v.participant_id).toBe(participantVegetarien.id);
    }
  });

  it('doit emettre une RecetteInconnueViolation pour une recette absente du catalogue', () => {
    const planning = makePlanning(['recette-fantome-xyz']);
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte], slotsFrom(planning));
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
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte], slotsFrom(planning));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('doit emettre 2 AllergenViolations quand 2 participants distincts ont le meme allergene gluten', () => {
    const planning = makePlanning(['pates-bolognaise']); // gluten
    const result = validatePlanning(planning, recettesMap, [
      participantCoeliaque,
      participantCoeliaqueVegan,
    ], slotsFrom(planning));
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
    const result = validatePlanning(planning, recettesMap, [participantSansContrainte], slotsFrom(planning));
    const unknownViolations = result.violations.filter((v) => v.kind === 'recette_inconnue');
    expect(unknownViolations).toHaveLength(1);
  });

  it('doit retourner un melange allergen+regime+recette_inconnue pour un planning problematique multi-participants', () => {
    // carbonara-classique: gluten -> allergen pour coeliaque; est_vegan=false -> regime pour vegan
    // recette-fantome -> recette_inconnue
    const planning = makePlanning(['carbonara-classique', 'recette-fantome']);
    const result = validatePlanning(planning, recettesMap, [
      participantCoeliaque,
      participantVegan,
    ], slotsFrom(planning));
    expect(result.valid).toBe(false);
    const kinds = result.violations.map((v) => v.kind);
    expect(kinds).toContain('allergen');
    expect(kinds).toContain('regime');
    expect(kinds).toContain('recette_inconnue');
  });

  it('doit retourner valid=true pour un planning vide', () => {
    const planning = makePlanning([]);
    const result = validatePlanning(planning, recettesMap, [participantCoeliaque], slotsFrom(planning));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  // ── Règle ingredient_principal_consecutif (groupement par jour) ──────────────

  it('doit echouer si meme ingredient_principal au matin et au soir du meme jour (midi differe)', () => {
    // Correction 1 : la règle est journalière, pas séquentielle.
    // pancakes-brunch (oeufs) + pates-bolognaise (boeuf) + omelette-legumes (oeufs) → même jour.
    // La paire (matin=oeufs, soir=oeufs) n'est pas adjacente dans la séquence mais viole la règle.
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch',   portions: 4 },
        { jour: 1, repas: 'midi',           recette_id: 'pates-bolognaise',  portions: 4 },
        { jour: 1, repas: 'soir',           recette_id: 'omelette-legumes',  portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const expectedSlots = planning.entries.map((e) => ({ jour: e.jour, repas: e.repas }));
    const result = validatePlanning(planning, recettesMap, [], expectedSlots);
    expect(result.valid).toBe(false);
    const v = result.violations.find((v) => v.kind === 'ingredient_principal_consecutif');
    expect(v).toBeDefined();
    if (v?.kind === 'ingredient_principal_consecutif') {
      expect(v.ingredient_principal).toBe('oeufs');
      expect(v.slot_a.jour).toBe(1);
      expect(v.slot_b.jour).toBe(1);
    }
  });

  it('ne doit pas echouer si meme ingredient_principal au soir J1 et au matin J2 (jours distincts)', () => {
    // Choix délibéré : frontière = jour calendaire, pas 24h glissantes.
    // soir J1 (oeufs) et petit-dejeuner J2 (oeufs) sont sur des jours différents → pas de violation.
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'soir',           recette_id: 'omelette-legumes', portions: 4 },
        { jour: 2, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch',  portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const expectedSlots = planning.entries.map((e) => ({ jour: e.jour, repas: e.repas }));
    const result = validatePlanning(planning, recettesMap, [], expectedSlots);
    expect(result.valid).toBe(true);
    expect(result.violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

});
