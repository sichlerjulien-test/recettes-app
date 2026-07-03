import type { ExclusionViolation, Participant, Planning, Recette } from '../types/domain';

/**
 * Valide les exclusions alimentaires d'un planning contre les participants.
 *
 * Opère sur un planning déjà validé par validatePlanning (allergens/validator.ts).
 * Les recettes inconnues sont ignorées ici — elles sont signalées par validatePlanning.
 *
 * Les violations ne sont PAS déduplicées par participant (3 vegans = 3 violations).
 *
 * @param planning       - Le planning à valider
 * @param recettesMap    - Index de toutes les recettes connues, clé = recette_id
 * @param participants   - Liste des participants du séjour
 * @returns Liste (potentiellement vide) de violations d'exclusion
 */
export function validateExclusions(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  participants: readonly Participant[],
): ExclusionViolation[] {
  const violations: ExclusionViolation[] = [];

  for (const entry of planning.entries) {
    if (entry.kind === 'resto') continue;
    const recette = recettesMap.get(entry.recette_id);
    if (recette === undefined) continue;

    for (const participant of participants) {
      for (const exclusion of participant.exclusions) {
        if (!recette.exclusions_compatibles.includes(exclusion)) {
          violations.push({
            kind: 'exclusion',
            recette_id: recette.id,
            recette_nom: recette.nom,
            exclusion,
            participant_id: participant.id,
            participant_nom: participant.nom,
          });
        }
      }
    }
  }

  return violations;
}
