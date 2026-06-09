import type { Participant, Planning, Recette, RegimeViolation } from '../types/domain';

/**
 * Valide les régimes alimentaires d'un planning contre les participants.
 *
 * Opère sur un planning déjà validé par validatePlanning (allergens/validator.ts).
 * Les recettes inconnues sont ignorées ici — elles sont signalées par validatePlanning.
 *
 * Les violations régimes ne sont PAS déduplicées par participant (3 vegans = 3 violations).
 *
 * @param planning       - Le planning à valider
 * @param recettesMap    - Index de toutes les recettes connues, clé = recette_id
 * @param participants   - Liste des participants du séjour
 * @returns Liste (potentiellement vide) de violations de régime
 */
export function validateDietary(
  planning: Planning,
  recettesMap: Map<string, Recette>,
  participants: readonly Participant[],
): RegimeViolation[] {
  const violations: RegimeViolation[] = [];

  for (const entry of planning.entries) {
    const recette = recettesMap.get(entry.recette_id);
    if (recette === undefined) continue;

    for (const participant of participants) {
      for (const regime of participant.regimes) {
        if (regime === 'vegan' && !recette.est_vegan) {
          violations.push({
            kind: 'regime',
            recette_id: recette.id,
            recette_nom: recette.nom,
            regime: 'vegan',
            participant_id: participant.id,
            participant_nom: participant.nom,
          });
        } else if (regime === 'vegetarien' && !recette.est_vegetarien) {
          violations.push({
            kind: 'regime',
            recette_id: recette.id,
            recette_nom: recette.nom,
            regime: 'vegetarien',
            participant_id: participant.id,
            participant_nom: participant.nom,
          });
        }
      }
    }
  }

  return violations;
}
