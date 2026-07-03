import type { MealType, Participant, Planning, PlanningEntry, Recette, ValidationViolation } from '../types/domain';
import { filterRecipes } from '../allergens/filter';
import { filterByExclusions } from '../dietary/filter';
import { validatePlanning } from '../allergens/validator';
import { validateExclusions } from '../dietary/validator';
import { validateCoherence, COHERENCE_SEVERITY } from '../coherence';
import type { PlanningConstraints } from '../llm/generate-planning';

export type SwapSlot = { jour: number; repas: MealType };

export type SwapError =
  | { kind: 'no_alternative_available' }
  | { kind: 'invalid_candidate'; recette_id: string }
  | { kind: 'validation_failed'; violations: ValidationViolation[] };

/**
 * Calcule l'ensemble des candidats éligibles pour remplacer le créneau targetSlot.
 *
 * Éligible = passe filterRecipes + filterByExclusions (sûreté par construction)
 *            ET validateCoherence sans violation 'bloquant' sur le planning hypothétique
 *            (candidat substitué, reste gardé).
 * La recette courante au créneau est systématiquement exclue.
 */
export function getEligibleCandidates(params: {
  planning: Planning;
  targetSlot: SwapSlot;
  catalogue: readonly Recette[];
  recettesMap: Map<string, Recette>;
  constraints: PlanningConstraints;
  participants: readonly Participant[];
  expectedSlots: readonly SwapSlot[];
}): { ok: true; candidates: Recette[] } | { ok: false; kind: 'no_alternative_available' } {
  const { planning, targetSlot, catalogue, recettesMap, constraints, participants, expectedSlots } = params;

  const currentEntry = planning.entries.find(
    (e) => e.jour === targetSlot.jour && e.repas === targetSlot.repas,
  );
  const currentRecetteId = currentEntry?.kind === 'recette' ? currentEntry.recette_id : undefined;

  const pool = filterByExclusions(
    filterRecipes([...catalogue], { ...constraints, type_repas_requis: targetSlot.repas }),
    constraints,
  );

  const candidates: Recette[] = [];

  for (const recette of pool) {
    if (recette.id === currentRecetteId) continue;

    const hypotheticalEntries: PlanningEntry[] = planning.entries.map((e) =>
      e.kind === 'recette' && e.jour === targetSlot.jour && e.repas === targetSlot.repas
        ? { ...e, recette_id: recette.id }
        : e,
    );

    const hypotheticalPlanning: Planning = {
      ...planning,
      entries: hypotheticalEntries,
    };

    const violations = validateCoherence(hypotheticalPlanning, recettesMap, expectedSlots);
    const hasBlocker = violations.some((v) => COHERENCE_SEVERITY[v.kind] === 'bloquant');

    if (!hasBlocker) {
      candidates.push(recette);
    }
  }

  if (candidates.length === 0) {
    return { ok: false, kind: 'no_alternative_available' };
  }

  return { ok: true, candidates };
}

/**
 * Valide le choix du client et construit les entries du nouveau planning.
 *
 * Re-calcule l'éligibilité serveur (confiance zéro client), vérifie l'appartenance
 * du choix à l'ensemble éligible, puis fait tourner la pile complète de validateurs
 * (validatePlanning + validateExclusions + validateCoherence) sur le résultat.
 */
export function computeSwapResult(params: {
  planning: Planning;
  targetSlot: SwapSlot;
  chosenRecetteId: string;
  catalogue: readonly Recette[];
  recettesMap: Map<string, Recette>;
  constraints: PlanningConstraints;
  participants: readonly Participant[];
  expectedSlots: readonly SwapSlot[];
}): { ok: true; entries: PlanningEntry[] } | { ok: false; error: SwapError } {
  const { planning, targetSlot, chosenRecetteId, catalogue, recettesMap, constraints, participants, expectedSlots } = params;

  // Re-compute eligibility serveur — confiance zéro client
  const eligibleResult = getEligibleCandidates({
    planning,
    targetSlot,
    catalogue,
    recettesMap,
    constraints,
    participants,
    expectedSlots,
  });

  if (!eligibleResult.ok) {
    return { ok: false, error: { kind: 'no_alternative_available' } };
  }

  const isEligible = eligibleResult.candidates.some((r) => r.id === chosenRecetteId);
  if (!isEligible) {
    return { ok: false, error: { kind: 'invalid_candidate', recette_id: chosenRecetteId } };
  }

  const targetEntry = planning.entries.find(
    (e) => e.jour === targetSlot.jour && e.repas === targetSlot.repas,
  );
  const portions = targetEntry?.kind === 'recette'
    ? targetEntry.portions
    : Math.max(participants.length, 1);

  const newEntries: PlanningEntry[] = planning.entries.map((e) =>
    e.kind === 'recette' && e.jour === targetSlot.jour && e.repas === targetSlot.repas
      ? { ...e, recette_id: chosenRecetteId, portions }
      : e,
  );

  const newPlanning: Planning = { ...planning, entries: newEntries };

  // Pile complète de validateurs (ADR-001 / ADR-021)
  const securityResult = validatePlanning(newPlanning, recettesMap, participants);
  const exclusionViolations = validateExclusions(newPlanning, recettesMap, participants);
  const coherenceViolations = validateCoherence(newPlanning, recettesMap, expectedSlots);

  const blockers: ValidationViolation[] = [
    ...(securityResult.valid ? [] : securityResult.violations),
    ...exclusionViolations,
    ...coherenceViolations.filter((v) => COHERENCE_SEVERITY[v.kind] === 'bloquant'),
  ];

  if (blockers.length > 0) {
    return { ok: false, error: { kind: 'validation_failed', violations: blockers } };
  }

  return { ok: true, entries: newEntries };
}
