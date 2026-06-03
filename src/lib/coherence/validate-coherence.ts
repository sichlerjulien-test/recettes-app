import type {
  IngredientConsecutifViolation,
  MealType,
  Planning,
  Recette,
  RecetteDupliqueeViolation,
  SlotsMismatchViolation,
} from '../types/domain';

export type CoherenceViolationKind =
  | 'slots_mismatch'
  | 'recette_dupliquee'
  | 'ingredient_principal_consecutif';

export type CoherenceViolation =
  | SlotsMismatchViolation
  | RecetteDupliqueeViolation
  | IngredientConsecutifViolation;

export const COHERENCE_SEVERITY: Record<CoherenceViolationKind, 'bloquant' | 'qualite'> = {
  slots_mismatch: 'bloquant',
  recette_dupliquee: 'bloquant',
  ingredient_principal_consecutif: 'bloquant',
};

/**
 * Valide la cohérence structurelle d'un planning (hors sécurité allergènes/régimes).
 *
 * Règles vérifiées :
 *   - slots_mismatch : les slots {jour,repas} correspondent exactement aux slots attendus
 *   - recette_dupliquee : pas deux fois la même recette_id
 *   - ingredient_principal_consecutif : pas le même ingredient_principal deux fois le même jour
 *
 * Les recette_id inconnus sont ignorés silencieusement (recette_inconnue est émis par validatePlanning).
 */
export function validateCoherence(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  expectedSlots: readonly { jour: number; repas: MealType }[],
): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];

  // ── Règle 1 : slots exacts ───────────────────────────────────────────────────
  const actualSlots = planning.entries.map((e) => ({ jour: e.jour, repas: e.repas }));
  const slotsMatch =
    expectedSlots.length === actualSlots.length &&
    expectedSlots.every((expected) =>
      actualSlots.some((a) => a.jour === expected.jour && a.repas === expected.repas),
    );
  if (!slotsMatch) {
    const v: SlotsMismatchViolation = { kind: 'slots_mismatch' };
    violations.push(v);
  }

  // ── Règle 2 : pas de recette dupliquée ───────────────────────────────────────
  const seenIds = new Set<string>();
  const reportedDuplicates = new Set<string>();
  for (const entry of planning.entries) {
    if (seenIds.has(entry.recette_id) && !reportedDuplicates.has(entry.recette_id)) {
      reportedDuplicates.add(entry.recette_id);
      const v: RecetteDupliqueeViolation = {
        kind: 'recette_dupliquee',
        recette_id: entry.recette_id,
      };
      violations.push(v);
    }
    seenIds.add(entry.recette_id);
  }

  // ── Règle 3 : unicité de l'ingredient_principal par jour ─────────────────────
  // Frontière = jour calendaire (ADR-009 §3). Les recette_id inconnus sont ignorés.
  const byJour = new Map<number, Array<{ repas: MealType; recette: Recette }>>();
  for (const entry of planning.entries) {
    const recette = recettesMap.get(entry.recette_id);
    if (recette === undefined) continue;
    if (!byJour.has(entry.jour)) byJour.set(entry.jour, []);
    byJour.get(entry.jour)!.push({ repas: entry.repas, recette });
  }

  for (const [jour, slots] of byJour) {
    const seen = new Map<string, MealType>();
    for (const { repas, recette } of slots) {
      const prevRepas = seen.get(recette.ingredient_principal);
      if (prevRepas !== undefined) {
        const v: IngredientConsecutifViolation = {
          kind: 'ingredient_principal_consecutif',
          ingredient_principal: recette.ingredient_principal,
          slot_a: { jour, repas: prevRepas },
          slot_b: { jour, repas },
        };
        violations.push(v);
      } else {
        seen.set(recette.ingredient_principal, repas);
      }
    }
  }

  return violations;
}
