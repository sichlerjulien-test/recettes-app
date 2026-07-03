import { describe, expect, it } from 'vitest';
import type { Planning } from '../types/domain';
import { recettesMap } from '../../../tests/fixtures/recettes';
import { validateCoherence } from './validate-coherence';

function makePlanning(recetteIds: string[]): Planning {
  return {
    id: 'planning-test',
    sejour_id: 'sejour-test',
    entries: recetteIds.map((recette_id, i) => ({
      kind: 'recette' as const,
      jour: Math.floor(i / 2) + 1,
      repas: i % 2 === 0 ? ('midi' as const) : ('soir' as const),
      recette_id,
      portions: 4,
    })),
    genere_le: '2026-04-21T00:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
  };
}

function slotsFrom(planning: Planning) {
  return planning.entries.map((e) => ({ kind: 'recette' as const, jour: e.jour, repas: e.repas }));
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
      { kind: 'recette' as const, jour: 1, repas: 'midi' as const },
      { kind: 'recette' as const, jour: 1, repas: 'soir' as const },
    ];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit emettre slots_mismatch quand le planning a plus de slots que attendu', () => {
    const planning = makePlanning(['salade-tomate-basilic', 'omelette-legumes', 'tajine-boeuf-soir']);
    const expectedSlots = [
      { kind: 'recette' as const, jour: 1, repas: 'midi' as const },
      { kind: 'recette' as const, jour: 1, repas: 'soir' as const },
    ];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit emettre slots_mismatch quand les slots existent mais ne correspondent pas (mauvais jour)', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [{ kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const expectedSlots = [{ kind: 'recette' as const, jour: 1, repas: 'midi' as const }];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.some((v) => v.kind === 'slots_mismatch')).toBe(true);
  });

  it('doit retourner [] pour un planning vide avec expectedSlots vide', () => {
    const planning = makePlanning([]);
    const violations = validateCoherence(planning, recettesMap, []);
    expect(violations).toHaveLength(0);
  });

  // ── recette_dupliquee — fenêtre glissante par créneau (ADR-009 amendement TK-39) ──

  it('doit emettre recette_dupliquee quand la meme recette_id apparait au meme creneau dans la fenetre', () => {
    // midi J1 + midi J2 : même créneau, |2-1|=1 < 3 → violation (cas week-end)
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    const dup = violations.find((v) => v.kind === 'recette_dupliquee');
    expect(dup).toBeDefined();
    if (dup?.kind === 'recette_dupliquee') {
      expect(dup.recette_id).toBe('salade-tomate-basilic');
    }
  });

  it('ne doit PAS emettre recette_dupliquee quand la meme recette apparait a des creneaux differents', () => {
    // midi J1 + soir J1 : créneaux distincts → pas de violation (ADR-009 amendement)
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  it('ne doit PAS emettre recette_dupliquee pour le petit-dejeuner meme repete', () => {
    // petit-déjeuner exempté : répétition libre (ADR-009 amendement TK-39)
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch', portions: 4 },
        { kind: 'recette' as const, jour: 2, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch', portions: 4 },
        { kind: 'recette' as const, jour: 3, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  it('doit emettre recette_dupliquee pour midi J et J+2 (distance < N=3)', () => {
    // |J+2 - J| = 2 < 3 → violation
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 3, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.some((v) => v.kind === 'recette_dupliquee')).toBe(true);
  });

  it('ne doit PAS emettre recette_dupliquee pour midi J et J+3 (distance = N=3)', () => {
    // |J+3 - J| = 3 >= 3 → OK
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 4, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  it("doit n'emettre qu'une seule recette_dupliquee meme si la recette_id apparait 3 fois au meme creneau", () => {
    // midi J1, midi J2, midi J3 : plusieurs paires en violation → une seule violation
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'recette' as const, jour: 3, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    const dups = violations.filter((v) => v.kind === 'recette_dupliquee');
    expect(dups).toHaveLength(1);
  });

  it('doit emettre recette_dupliquee meme pour un recette_id inconnu du catalogue (meme creneau)', () => {
    // recette inconnue : le catalogue n'est pas consulté pour recette_dupliquee
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-fantome', portions: 4 },
        { kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'recette-fantome', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
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
        { kind: 'recette' as const, jour: 1, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch',   portions: 4 },
        { kind: 'recette' as const, jour: 1, repas: 'midi',           recette_id: 'pates-bolognaise',  portions: 4 },
        { kind: 'recette' as const, jour: 1, repas: 'soir',           recette_id: 'omelette-legumes',  portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const expectedSlots = planning.entries.map((e) => ({ kind: 'recette' as const, jour: e.jour, repas: e.repas }));
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
        { kind: 'recette' as const, jour: 1, repas: 'soir',           recette_id: 'omelette-legumes', portions: 4 },
        { kind: 'recette' as const, jour: 2, repas: 'petit-dejeuner', recette_id: 'pancakes-brunch',  portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const expectedSlots = planning.entries.map((e) => ({ kind: 'recette' as const, jour: e.jour, repas: e.repas }));
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

  it('doit ignorer silencieusement les recette_id inconnus pour la regle ingredient_principal_consecutif', () => {
    // recette-fantome est inconnue → ignorée. La règle ne s'applique pas.
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-fantome', portions: 4 },
        { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const violations = validateCoherence(planning, recettesMap, slotsFrom(planning));
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

  it('ne doit pas lever dexception quand toutes les recettes sont inconnues avec expectedSlots non vides', () => {
    // Comportement défensif : les recettes inconnues sont ignorées silencieusement.
    // Les slots ne correspondent pas (slots attendus ≠ slots réels) → slots_mismatch uniquement.
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'fantome-a', portions: 4 },
        { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'fantome-b', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const expectedSlots = [{ kind: 'recette' as const, jour: 1, repas: 'midi' as const }, { kind: 'recette' as const, jour: 1, repas: 'soir' as const }];
    const violations = validateCoherence(planning, recettesMap, expectedSlots);
    // slots_mismatch ne se déclenche pas (slots correspondent exactement)
    expect(violations.filter((v) => v.kind === 'slots_mismatch')).toHaveLength(0);
    // ingredient_principal_consecutif ne se déclenche pas (recettes inconnues ignorées)
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
    // recette_dupliquee ne se déclenche pas (deux IDs distincts)
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  // ── TK-42 : slots resto (ADR-022) ────────────────────────────────────────────

  it('CA-1 : planning avec un slot resto ne lève pas slots_mismatch', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'resto' as const, jour: 1, repas: 'soir' },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const allSlots = [{ jour: 1, repas: 'midi' as const }, { jour: 1, repas: 'soir' as const }];
    const violations = validateCoherence(planning, recettesMap, allSlots);
    expect(violations.filter((v) => v.kind === 'slots_mismatch')).toHaveLength(0);
  });

  it('CA-2a : recette_dupliquee ignore les slots resto', () => {
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'resto' as const, jour: 1, repas: 'soir' },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const allSlots = [{ jour: 1, repas: 'midi' as const }, { jour: 1, repas: 'soir' as const }];
    const violations = validateCoherence(planning, recettesMap, allSlots);
    expect(violations.filter((v) => v.kind === 'recette_dupliquee')).toHaveLength(0);
  });

  it('CA-2b : ingredient_principal_consecutif ignore les slots resto — le slot resto coupe la séquence', () => {
    // salade (légumes) midi J1 → resto soir J1 → salade (légumes) midi J2
    // Le slot resto coupe la séquence : pas de violation ingredient_principal_consecutif
    const planning: Planning = {
      id: 'planning-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'resto' as const, jour: 1, repas: 'soir' },
        { kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
      ],
      genere_le: '2026-04-21T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const allSlots = [
      { jour: 1, repas: 'midi' as const },
      { jour: 1, repas: 'soir' as const },
      { jour: 2, repas: 'midi' as const },
    ];
    const violations = validateCoherence(planning, recettesMap, allSlots);
    expect(violations.filter((v) => v.kind === 'ingredient_principal_consecutif')).toHaveLength(0);
  });

});
