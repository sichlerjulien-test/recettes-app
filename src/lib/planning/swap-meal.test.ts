import { describe, expect, it } from 'vitest';
import type { Participant, PlanningEntry, StoredPlanning, Recette } from '../types/domain';
import type { PlanningConstraints } from '../llm/generate-planning';
import { computeSwapResult, getEligibleCandidates } from './swap-meal';

// ─── Helpers fixtures ──────────────────────────────────────────────────────────

function makeRecette(partial: {
  id: string;
  ingredient_principal: Recette['ingredient_principal'];
  type_repas?: Recette['type_repas'];
  allergenes_calcules?: Recette['allergenes_calcules'];
  exclusions_compatibles?: Recette['exclusions_compatibles'];
  equipement?: Recette['equipement'];
}): Recette {
  return {
    id: partial.id,
    nom: partial.id,
    description: '',
    portions_base: 4,
    duree_minutes: 30,
    duree_active: 15,
    difficulte: 'facile',
    equipement: partial.equipement ?? ['plaque'],
    type_repas: partial.type_repas ?? ['midi', 'soir'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: partial.ingredient_principal,
    feculent_dominant: 'aucun',
    ingredients: [{ ingredient_id: 'tomate', quantite_base: 100, unite: 'g', optionnel: false }],
    etapes: ['Étape 1'],
    tags_libres: [],
    allergenes_calcules: partial.allergenes_calcules ?? [],
    exclusions_compatibles: partial.exclusions_compatibles ?? ['vegetarien', 'vegan'],
  };
}

function makePlanning(entries: { kind: 'recette'; jour: number; repas: PlanningEntry['repas']; recette_id: string }[]): StoredPlanning {
  return {
    id: 'p-test',
    sejour_id: 'sejour-test',
    entries: entries.map((e) => ({ ...e, portions: 4 })),
    genere_le: '2026-07-02T00:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque'] },
  };
}

// ─── Recettes de test ─────────────────────────────────────────────────────────
// A : ingredient_principal=legumes, vegan, sans allergène
// B : ingredient_principal=oeufs, végétarien (pas vegan), sans allergène
// C : ingredient_principal=poulet, non-végétarien
// D : ingredient_principal=boeuf, contient gluten
// E : ingredient_principal=fromage, végétarien, sans allergène

const rA = makeRecette({ id: 'recette-a', ingredient_principal: 'legumes' });
const rB = makeRecette({ id: 'recette-b', ingredient_principal: 'oeufs',   exclusions_compatibles: ['vegetarien'] });
const rC = makeRecette({ id: 'recette-c', ingredient_principal: 'poulet',  exclusions_compatibles: [] });
const rD = makeRecette({ id: 'recette-d', ingredient_principal: 'boeuf',   allergenes_calcules: ['gluten'], exclusions_compatibles: [] });
const rE = makeRecette({ id: 'recette-e', ingredient_principal: 'fromage', exclusions_compatibles: ['vegetarien'] });

const catalogue = [rA, rB, rC, rD, rE];
const recettesMap = new Map(catalogue.map((r) => [r.id, r]));

// Sarah : coelique + végétarienne (persona de référence ADR-021)
const sarah: Participant = {
  id: 'sarah',
  nom: 'Sarah',
  allergies: ['gluten'],
  exclusions: ['vegetarien'],
  aime: [],
  n_aime_pas: [],
};

const constraintsSarah: PlanningConstraints = {
  allergenes_groupe: ['gluten'],
  exclusions_groupe: ['vegetarien'],
  equipement_disponible: ['plaque'],
};

// ─── getEligibleCandidates ────────────────────────────────────────────────────

describe('getEligibleCandidates', () => {
  it('retourne exactement les candidats qui passent validateCoherence sans bloquant, courante exclue', () => {
    // J1 midi = rA (legumes), J1 soir = rB (oeufs) ← à swapper
    // Attendu :
    //   rA : legumes au midi J1 + legumes au soir J1 → ingredient_principal_consecutif bloquant → exclu
    //   rB : courante → exclue
    //   rC : non-végétarien → filtré par filterByExclusions
    //   rD : gluten → filtré par filterRecipes
    //   rE : fromage au soir J1, aucune collision → ÉLIGIBLE
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = getEligibleCandidates({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.candidates.map((r) => r.id);
    expect(ids).toContain('recette-e');
    expect(ids).not.toContain('recette-b'); // courante
    expect(ids).not.toContain('recette-a'); // collision ingredient_principal
    expect(ids).not.toContain('recette-c'); // non-végétarien
    expect(ids).not.toContain('recette-d'); // gluten
  });

  it('retourne no_alternative_available quand tous les candidats du pool collisionnent', () => {
    // J1 midi = rA (legumes), J1 soir = rB (oeufs) ← à swapper
    // Catalogue réduit : seulement rA (collision legumes) et rB (courante)
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = getEligibleCandidates({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      catalogue: [rA, rB],
      recettesMap: new Map([[rA.id, rA], [rB.id, rB]]),
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('no_alternative_available');
  });

  it('retourne no_alternative_available quand catalogue vide après filtrage', () => {
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-d' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-d' },
    ]);

    // Seuls rC et rD dans le catalogue : rC exclu (végé), rD exclu (gluten)
    const result = getEligibleCandidates({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      catalogue: [rC, rD],
      recettesMap: new Map([[rC.id, rC], [rD.id, rD]]),
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('no_alternative_available');
  });

  it('filtre type_repas : ne propose que des recettes compatibles avec le créneau', () => {
    // rF uniquement compatible midi, pas soir
    const rF = makeRecette({
      id: 'recette-f',
      ingredient_principal: 'fromage',
      type_repas: ['midi'],
    });
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = getEligibleCandidates({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      catalogue: [rA, rB, rF],
      recettesMap: new Map([[rA.id, rA], [rB.id, rB], [rF.id, rF]]),
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    // rF exclus (type_repas ne couvre pas 'soir')
    if (result.ok) {
      expect(result.candidates.map((r) => r.id)).not.toContain('recette-f');
    }
  });

  it('exclut la recette dupliquée dans la fenêtre glissante (règle §4 recette_dupliquee)', () => {
    // Planning multi-jours : rE apparaît au soir J1.
    // Si on swape soir J2, rE ne devrait pas être proposé (distance = 1 < 3)
    const rOther = makeRecette({ id: 'recette-other', ingredient_principal: 'legumineuses' });

    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-e' },  // rE au soir J1
      { kind: 'recette' as const, jour: 2, repas: 'soir', recette_id: 'recette-other' }, // à swapper
    ]);

    const result = getEligibleCandidates({
      planning,
      targetSlot: { jour: 2, repas: 'soir' },
      catalogue: [rA, rB, rE, rOther],
      recettesMap: new Map([[rA.id, rA], [rB.id, rB], [rE.id, rE], [rOther.id, rOther]]),
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'soir' }, { jour: 2, repas: 'soir' }],
    });

    if (result.ok) {
      // rE est à distance 1 du soir J2 → recette_dupliquee bloquant → exclu
      expect(result.candidates.map((r) => r.id)).not.toContain('recette-e');
    }
  });
});

// ─── computeSwapResult ────────────────────────────────────────────────────────

describe('computeSwapResult', () => {
  it('retourne les nouvelles entries quand le choix est éligible', () => {
    // Swap soir J1 : courante=rB → choisit rE
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-e',
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const swapped = result.entries.find((e) => e.jour === 1 && e.repas === 'soir');
    expect(swapped).toMatchObject({ recette_id: 'recette-e' });
    // Les autres entrées sont intactes
    const intact = result.entries.find((e) => e.jour === 1 && e.repas === 'midi');
    expect(intact).toMatchObject({ recette_id: 'recette-a' });
  });

  it("rejette un recette_id non éligible envoyé par le client (cas d'attaque explicite)", () => {
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    // rC non-végétarien → non dans l'ensemble éligible
    const result = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-c',
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_candidate');
  });

  it('rejette un recette_id bien formé mais inconnu du catalogue', () => {
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-inconnue',
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // recette-inconnue n'est pas dans les éligibles → invalid_candidate
    expect(result.error.kind).toBe('invalid_candidate');
  });

  it('retourne no_alternative_available quand aucun éligible', () => {
    // Catalogue réduit : seul rA (collision legumes) et rB (courante)
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const result = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-a', // même inéligible
      catalogue: [rA, rB],
      recettesMap: new Map([[rA.id, rA], [rB.id, rB]]),
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('no_alternative_available');
  });

  it('le planning résultat passe les 3 validateurs (fixture où un pick naïf collisionnerait)', () => {
    // Fixture : J1 midi=rA (legumes), J1 soir=rB (oeufs) ← swappé par rE (fromage)
    // Un pick naïf de rA (legumes) provoquerait ingredient_principal_consecutif
    // computeSwapResult doit rejeter rA et accepter rE
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
    ]);

    const naif = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-a', // collision ingredient_principal
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });
    expect(naif.ok).toBe(false); // rejeté

    const safe = computeSwapResult({
      planning,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-e',
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });
    expect(safe.ok).toBe(true); // accepté
  });

  it('slot kind=resto : computeSwapResult ne flip pas le kind, le slot reste resto', () => {
    // Planning : J1 midi = rA (recette), J1 soir = kind='resto'
    const planningWithResto: StoredPlanning = {
      id: 'p-test',
      sejour_id: 'sejour-test',
      entries: [
        { kind: 'recette', jour: 1, repas: 'midi', recette_id: 'recette-a', portions: 4 },
        { kind: 'resto', jour: 1, repas: 'soir' },
      ],
      genere_le: '2026-07-02T00:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque'] },
    };

    const result = computeSwapResult({
      planning: planningWithResto,
      targetSlot: { jour: 1, repas: 'soir' },
      chosenRecetteId: 'recette-e',
      catalogue,
      recettesMap,
      constraints: constraintsSarah,
      participants: [sarah],
      expectedSlots: [{ jour: 1, repas: 'midi' }, { jour: 1, repas: 'soir' }],
    });

    if (result.ok) {
      // Le slot soir J1 doit rester kind='resto', sans flip vers kind='recette'
      const slot = result.entries.find((e) => e.jour === 1 && e.repas === 'soir');
      expect(slot?.kind).toBe('resto');
    } else {
      // no_alternative_available est aussi acceptable — dans les deux cas, aucun kind flip
      expect(result.error.kind).toBe('no_alternative_available');
    }
  });

  it('boucle sûreté Sarah : tous les swaps éligibles sont allergène-safe et cohérents', () => {
    // Planning 2 jours, swap chaque créneau, vérifier que chaque résultat valide est sûr
    const expectedSlots = [
      { jour: 1, repas: 'midi' as const },
      { jour: 1, repas: 'soir' as const },
      { jour: 2, repas: 'midi' as const },
      { jour: 2, repas: 'soir' as const },
    ];
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-a' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-b' },
      { kind: 'recette' as const, jour: 2, repas: 'midi', recette_id: 'recette-e' },
      { kind: 'recette' as const, jour: 2, repas: 'soir', recette_id: 'recette-a' },
    ]);

    for (const slot of expectedSlots) {
      const eligibleResult = getEligibleCandidates({
        planning,
        targetSlot: slot,
        catalogue,
        recettesMap,
        constraints: constraintsSarah,
        participants: [sarah],
        expectedSlots,
      });

      if (!eligibleResult.ok) continue; // no_alternative_available est acceptable

      for (const candidate of eligibleResult.candidates) {
        const result = computeSwapResult({
          planning,
          targetSlot: slot,
          chosenRecetteId: candidate.id,
          catalogue,
          recettesMap,
          constraints: constraintsSarah,
          participants: [sarah],
          expectedSlots,
        });

        // Tout candidat éligible doit produire un résultat valide
        expect(result.ok).toBe(true);
        if (!result.ok) continue;

        // Vérifier : aucune entrée ne contient un allergène gluten
        for (const entry of result.entries) {
          if (entry.kind !== 'recette') continue;
          const r = recettesMap.get(entry.recette_id);
          if (r) {
            expect(r.allergenes_calcules).not.toContain('gluten');
          }
        }
      }
    }
  });
});
