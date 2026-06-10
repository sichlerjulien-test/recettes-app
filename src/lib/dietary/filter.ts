import type { ExclusionTag } from '../types/domain';
import type { Recette } from '../types/domain';

export interface ExclusionConstraints {
  exclusions_groupe: ExclusionTag[];
}

/**
 * Filtre un pool de recettes selon les exclusions alimentaires du groupe.
 *
 * Doit être appelé sur un pool déjà sécurisé (allergènes filtrés).
 * Ordre de résultat identique à l'input (pas de tri implicite).
 *
 * Une recette passe si toutes les exclusions déclarées figurent dans
 * recette.exclusions_compatibles.
 *
 * @param recipes - Pool de recettes pré-filtré par les allergènes
 * @param constraints - Exclusions déclarées dans le groupe
 * @returns Sous-ensemble compatible avec toutes les exclusions
 */
export function filterByExclusions(
  recipes: readonly Recette[],
  constraints: ExclusionConstraints,
): Recette[] {
  if (constraints.exclusions_groupe.length === 0) return [...recipes];

  return recipes.filter((recette) =>
    constraints.exclusions_groupe.every(
      (excl) => recette.exclusions_compatibles.includes(excl),
    ),
  );
}
