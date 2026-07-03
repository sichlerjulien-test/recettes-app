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

// Fenêtre glissante pour recette_dupliquee (ADR-009 amendement TK-39).
// Une même recette est interdite au même créneau midi/soir si elle réapparaît
// dans les N jours suivants. Petit-déjeuner est exempté.
export const RECETTE_DUPLIQUEE_WINDOW_DAYS = 3;

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

  // ── Règle 2 : pas de recette dupliquée au même créneau dans la fenêtre ───────
  // Petit-déjeuner exempté (ADR-009 amendement TK-39).
  // Slots resto ignorés explicitement (ADR-022) — ils n'ont pas de recette_id.
  // Pour midi et soir : fenêtre glissante de RECETTE_DUPLIQUEE_WINDOW_DAYS jours
  // par créneau — deux occurrences à distance < N jours → violation bloquante.
  {
    const byRecetteSlot = new Map<string, Map<MealType, number[]>>();
    for (const entry of planning.entries) {
      if (entry.kind === 'resto') continue;
      if (entry.repas === 'petit-dejeuner') continue;
      if (!byRecetteSlot.has(entry.recette_id)) {
        byRecetteSlot.set(entry.recette_id, new Map());
      }
      const bySlot = byRecetteSlot.get(entry.recette_id)!;
      if (!bySlot.has(entry.repas)) bySlot.set(entry.repas, []);
      bySlot.get(entry.repas)!.push(entry.jour);
    }

    const reportedDuplicates = new Set<string>();
    for (const [recette_id, bySlot] of byRecetteSlot) {
      if (reportedDuplicates.has(recette_id)) continue;
      for (const [, jours] of bySlot) {
        if (jours.length < 2) continue;
        const sorted = [...jours].sort((a, b) => a - b);
        for (let i = 0; i < sorted.length - 1; i++) {
          const curr = sorted[i] as number;
          const next = sorted[i + 1] as number;
          if (next - curr < RECETTE_DUPLIQUEE_WINDOW_DAYS) {
            reportedDuplicates.add(recette_id);
            violations.push({ kind: 'recette_dupliquee', recette_id });
            break;
          }
        }
        if (reportedDuplicates.has(recette_id)) break;
      }
    }
  }

  // ── Règle 3 : unicité de l'ingredient_principal par jour ─────────────────────
  // Frontière = jour calendaire (ADR-009 §3). Les recette_id inconnus sont ignorés.
  // Slots resto ignorés explicitement (ADR-022) — ils n'ont pas de recette_id.
  const byJour = new Map<number, Array<{ repas: MealType; recette: Recette }>>();
  for (const entry of planning.entries) {
    if (entry.kind === 'resto') continue;
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
