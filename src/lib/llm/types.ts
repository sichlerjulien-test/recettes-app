import type { MealType, Recette, ValidationViolation } from '../types/domain';

export interface GeneratePlanningInput {
  /** Pool déjà filtré (recettes garanties safe pour le groupe) */
  pool: Recette[];
  /** Contexte du séjour — sans allergies ni noms de participants */
  contexte: {
    nb_jours: number;
    repartition_repas: { midis: number; soirs: number; brunchs: number };
    niveau_cuisine: 'facile' | 'normal';
    temps_disponible: 'rapide' | 'standard';
  };
}

export interface GeneratePlanningOutput {
  entries: Array<{
    jour: number;
    repas: MealType;
    recette_id: string;
  }>;
}

/** Erreurs métier discriminées du module LLM */
export type LLMError =
  | { kind: 'pool_empty' }
  | { kind: 'validation_failed_after_retries'; lastViolations: ValidationViolation[] }
  | { kind: 'llm_unavailable'; cause: string };
