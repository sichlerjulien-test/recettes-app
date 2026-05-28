import type {
  AllergenViolation,
  IngredientConsecutifViolation,
  MealType,
  Participant,
  Planning,
  Recette,
  RecetteDupliqueeViolation,
  RecetteInconnueViolation,
  RegimeViolation,
  SlotsMismatchViolation,
  ValidationResult,
  ValidationViolation,
} from '../types/domain';

/**
 * Valide un planning généré contre les contraintes réelles du groupe.
 *
 * C'est la dernière ligne de défense avant persistance (Étage 3 selon l'ADR-001).
 * Elle est appelée après chaque génération LLM et doit être passée avec succès
 * avant toute écriture en base.
 *
 * Règles vérifiées :
 *   - Intégrité : toute recette référencée dans le planning doit exister
 *   - Allergènes : aucune recette ne peut contenir un allergène déclaré par un participant
 *   - Régimes : aucune recette ne peut violer le régime déclaré par un participant
 *   - Structurelles :
 *     · Les slots {jour,repas} correspondent exactement aux slots attendus
 *     · Pas deux fois la même recette_id
 *     · Pas le même ingredient_principal deux fois dans la même journée calendaire
 *
 * Les violations allergènes/régimes ne sont PAS déduplicées par participant (3 cœliaques
 * = 3 violations distinctes). L'UI est responsable de la consolidation de l'affichage.
 * Une seule `RecetteInconnueViolation` est émise par `recette_id` manquant.
 *
 * @param planning       - Le planning à valider
 * @param recettesMap    - Index de toutes les recettes connues, clé = recette_id
 * @param participants   - Liste des participants du séjour
 * @param expectedSlots  - Séquence attendue produite par buildSequence
 * @returns ValidationResult avec `valid: true` uniquement si aucune violation
 */
export function validatePlanning(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  participants: readonly Participant[],
  expectedSlots: readonly { jour: number; repas: MealType }[],
): ValidationResult {
  const violations: ValidationViolation[] = [];

  // ── Règle structurelle 1 : slots exacts ──────────────────────────────────────
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

  // ── Règle structurelle 2 : pas de recette dupliquée ──────────────────────────
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

  // ── Règles allergènes / régimes / intégrité ───────────────────────────────────
  const reportedUnknownIds = new Set<string>();

  for (const entry of planning.entries) {
    const recette = recettesMap.get(entry.recette_id);

    if (recette === undefined) {
      if (!reportedUnknownIds.has(entry.recette_id)) {
        reportedUnknownIds.add(entry.recette_id);
        const v: RecetteInconnueViolation = {
          kind: 'recette_inconnue',
          recette_id: entry.recette_id,
          participant_id: undefined,
          participant_nom: undefined,
        };
        violations.push(v);
      }
      continue;
    }

    for (const participant of participants) {
      for (const allergen of participant.allergies) {
        if (recette.allergenes_calcules.includes(allergen)) {
          const v: AllergenViolation = {
            kind: 'allergen',
            recette_id: recette.id,
            recette_nom: recette.nom,
            allergene: allergen,
            participant_id: participant.id,
            participant_nom: participant.nom,
          };
          violations.push(v);
        }
      }

      for (const regime of participant.regimes) {
        if (regime === 'vegan' && !recette.est_vegan) {
          const v: RegimeViolation = {
            kind: 'regime',
            recette_id: recette.id,
            recette_nom: recette.nom,
            regime: 'vegan',
            participant_id: participant.id,
            participant_nom: participant.nom,
          };
          violations.push(v);
        } else if (regime === 'vegetarien' && !recette.est_vegetarien) {
          const v: RegimeViolation = {
            kind: 'regime',
            recette_id: recette.id,
            recette_nom: recette.nom,
            regime: 'vegetarien',
            participant_id: participant.id,
            participant_nom: participant.nom,
          };
          violations.push(v);
        }
      }
    }
  }

  // ── Règle structurelle 3 : unicité de l'ingredient_principal par jour ─────────
  // Groupement par jour calendaire (champ `jour`). Un même ingredient_principal
  // peut apparaître le soir J1 et le matin J2 sans violation — la frontière est
  // le jour, pas les 24h glissantes. Choix délibéré : déterministe et simple.
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

  return {
    valid: violations.length === 0,
    violations,
  };
}
