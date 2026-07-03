import type {
  AllergenViolation,
  Participant,
  Planning,
  Recette,
  RecetteInconnueViolation,
  ValidationResult,
  ValidationViolation,
} from '../types/domain';

/**
 * Valide un planning contre les contraintes de sécurité allergènes du groupe.
 *
 * C'est la dernière ligne de défense sécurité avant persistance (Étage 3 selon l'ADR-001).
 * Les règles de cohérence structurelle (slots, doublons, ingredient_principal) sont dans
 * lib/coherence/validate-coherence.ts (ADR-009).
 * Les règles de régime alimentaire sont dans lib/dietary/validator.ts (TK-05 Phase 1).
 *
 * Règles vérifiées :
 *   - Intégrité : toute recette référencée dans le planning doit exister
 *   - Allergènes : aucune recette ne peut contenir un allergène déclaré par un participant
 *
 * Les violations allergènes ne sont PAS déduplicées par participant (3 cœliaques
 * = 3 violations distinctes). L'UI est responsable de la consolidation de l'affichage.
 * Une seule `RecetteInconnueViolation` est émise par `recette_id` manquant.
 *
 * @param planning       - Le planning à valider
 * @param recettesMap    - Index de toutes les recettes connues, clé = recette_id
 * @param participants   - Liste des participants du séjour
 * @returns ValidationResult avec `valid: true` uniquement si aucune violation
 */
export function validatePlanning(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  participants: readonly Participant[],
): ValidationResult {
  const violations: ValidationViolation[] = [];

  const reportedUnknownIds = new Set<string>();

  for (const entry of planning.entries) {
    if (entry.kind === 'resto') continue;

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
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
