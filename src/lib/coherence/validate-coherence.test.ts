import { describe, expect, it } from 'vitest';
import type { Planning } from '../types/domain';
import { recettesMap } from '../../../tests/fixtures/recettes';
import { validateCoherence } from './validate-coherence';

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

function slotsFrom(planning: Planning) {
  return planning.entries.map((e) => ({ jour: e.jour, repas: e.repas }));
}

describe('validateCoherence', () => {

  // ── slots_mismatch ────────────────────────────────────────────────────────────

  it('doit retourner [] quand les slots correspondent exactement aux expectedSlots', () => {
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes']);
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations).toHaveLength(0);
  });

  it('doit emettre slots_mismatch quand le planning a moins de slots que attendu', () => {
    const planning = makePlanning(['salade-tomate-basilic']);
    const expectedSlots = [
      { jour: 1, repas: 'midi' as const },
      { jour: 1, repas: 'soir' as const },
    ];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit emettre slots_mismatch quand le planning a plus de slots que attendu', () => {
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes', 'tajine-agneau-soir']);
    const expectedSlots = [
      { jour: 1, repas: 'midi' as const },
      { jour: 1, repas: 'soir' as const },
    ];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit emettre slots_mismatch quand les slots existent mais ne correspondent pas (mauvais jour)', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [{ jour: 2, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const expectedSlots = [{ jour: 1, repas: 'midi' as const }];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit retourner [] pour un planning vide avec expectedSlots vide', () => {
    const planning = makePlanning([]);
    const violations = validateCoherence(planning, recettesMap, []);
    expect(violations).toHaveLength(0);
  });

  // ── recette_dupliquee ─────────────────────────────────────────────────────────

  it('doit emettre recette_dupliquee quand la meme recette_id apparait deux fois', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    const dup = violations.find((v) => v.kind === 'recette_dupliquee');
    expect(dup).toBeDefined();
    if (dup?.kind === 'recette_dupliquee') {
      expect(dup.recette_id).toBe('salade-tomate-basilic');
    }
  });

  it("doit n'emettre qu'une seule recette_dupliquee meme si la recette_id apparait 3 fois", () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'midi',           recette_id: 'salade-tomate-basilic', portions: 4 },
        { jour: 1, repas: 'soir',           recette_id: 'salade-tomate-basilic', portions: 4 },
        { jour: 2, repas: 'midi',           recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    const dups = violations.filter((v) => v.kind === 'recette_dupliquee');
    expect(dups).toHaveLength(1);
  });

  it('doit emettre recette_dupliquee meme pour un recette_id inconnu du catalogue', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'recette-fantome', portions: 4 },
        { jour: 1, repas: 'soir', recette_id: 'recette-fantome', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.some((v) => v.kind === 'recette_dupliquee')).toBe(true);
  });

  it('doit ne pas emettre recette_dupliquee quand toutes les recettes sont distinctes', () => {
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes']);
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  // ── ingredient_principal_consecutif ──────────────────────────────────────────
  // Migrés depuis validator.test.ts — assertions identiques, même intention.

  it('doit echouer si meme ingredient_principal au matin et au soir du meme jour (midi differe)', () => {
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
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    const v = violations.find((v) => v.kind === 'ingredient_principal_consecutif');
    expect(v).toBeDefined();
    if (v?.kind === 'ingredient_principal_consecutif') {
      expect(v.ingredient_principal).toBe('oeufs');
      expect(v.slot_a.jour).toBe(1);
      expect(v.slot_b.jour).toBe(1);
    }
  });

  it('ne doit pas echouer si meme ingredient_principal au soir J1 et au matin J2 (jours distincts)', () => {
    // Frontière = jour calendaire (ADR-009 §3) : soir J1 et petit-dejeuner J2 → pas de violation.
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
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

  it('doit ignorer silencieusement les recette_id inconnus pour la regle ingredient_principal_consecutif', () => {
    // recette-fantome est inconnue → ignorée. La règle ne s'applique pas.
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'recette-fantome', portions: 4 },
        { jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

});
