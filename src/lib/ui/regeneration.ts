export type RegenerationAction = 'confirm' | 'generate';

/**
 * Détermine l'action à effectuer après mise à jour d'un séjour.
 * Si un planning existe déjà, on demande confirmation avant d'écraser.
 * Sinon, on génère directement.
 */
export function determineRegenerationAction(hasPlanning: boolean): RegenerationAction {
  return hasPlanning ? 'confirm' : 'generate';
}
