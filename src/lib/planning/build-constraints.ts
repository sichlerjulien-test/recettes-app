import type { Sejour } from '../types/domain';
import type { PlanningConstraints } from '../llm/generate-planning';

export function buildPlanningConstraints(sejour: Sejour): PlanningConstraints {
  return {
    allergenes_groupe: [...new Set(sejour.participants.flatMap((p) => p.allergies))],
    exclusions_groupe: [...new Set(sejour.participants.flatMap((p) => p.exclusions))],
    equipement_disponible: sejour.parametres.equipement_disponible,
  };
}
