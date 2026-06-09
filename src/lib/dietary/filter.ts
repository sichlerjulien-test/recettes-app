import type { DietaryRestriction } from '../../../data/seed-dietary';
import type { Recette } from '../types/domain';

export interface DietaryConstraints {
  regimes_groupe: DietaryRestriction[];
}

/**
 * Filtre un pool de recettes selon les régimes alimentaires du groupe.
 *
 * Doit être appelé sur un pool déjà sécurisé (allergènes filtrés).
 * Ordre de résultat identique à l'input (pas de tri implicite).
 *
 * @param recipes - Pool de recettes pré-filtré par les allergènes
 * @param constraints - Régimes déclarés dans le groupe
 * @returns Sous-ensemble compatible avec les régimes
 */
export function filterByDietary(
  recipes: readonly Recette[],
  constraints: DietaryConstraints,
): Recette[] {
  const isVegan = constraints.regimes_groupe.includes('vegan');
  const isVegetarien = constraints.regimes_groupe.includes('vegetarien');

  if (!isVegan && !isVegetarien) return [...recipes];

  return recipes.filter((recette) => {
    if (isVegan && !recette.est_vegan) return false;
    if (!isVegan && isVegetarien && !recette.est_vegetarien) return false;
    return true;
  });
}
