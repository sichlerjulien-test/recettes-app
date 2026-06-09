import type { Allergen } from '../../../data/seed-allergenes';
import type { Equipment, MealType, Recette } from '../types/domain';

/**
 * Contraintes de filtrage issues du groupe de participants et des paramètres
 * du séjour. Toutes les contraintes sont cumulatives (ET logique).
 */
export interface FilterConstraints {
  /** Union de tous les allergènes déclarés dans le groupe */
  allergenes_groupe: Allergen[];
  /** Équipements disponibles dans le gîte/lieu du séjour */
  equipement_disponible: Equipment[];
  /** Si fourni, ne garder que les recettes compatibles avec ce type de repas */
  type_repas_requis?: MealType | undefined;
}

/**
 * Filtre un catalogue de recettes selon les contraintes allergènes et équipement.
 *
 * Les filtres sont appliqués dans cet ordre :
 *   1. Allergènes (sécurité — ne jamais servir un allergène déclaré)
 *   2. Équipement disponible
 *   3. Type de repas (optionnel)
 *
 * Les régimes alimentaires sont traités par filterByDietary (lib/dietary/filter.ts)
 * sur le pool résultant de cette fonction.
 *
 * Une recette doit passer TOUS les filtres applicables pour être retenue.
 * L'ordre de résultat est celui de l'input (pas de tri implicite).
 *
 * @param recipes - Catalogue complet des recettes (non muté)
 * @param constraints - Contraintes extraites du groupe de participants
 * @returns Sous-ensemble des recettes garanties sans allergène déclaré
 *
 * @example
 * const pool = filterRecipes(catalogue, {
 *   allergenes_groupe: ['gluten'],
 *   equipement_disponible: ['plaque', 'four'],
 * });
 */
export function filterRecipes(
  recipes: readonly Recette[],
  constraints: FilterConstraints,
): Recette[] {
  const allergeneSet = new Set(constraints.allergenes_groupe);
  const equipementSet = new Set(constraints.equipement_disponible);

  return recipes.filter((recette) => {
    // 1. Filtre allergènes — critique, en premier
    for (const allergen of recette.allergenes_calcules) {
      if (allergeneSet.has(allergen)) return false;
    }

    // 2. Filtre équipement : tous les équipements requis doivent être disponibles
    for (const equip of recette.equipement) {
      if (!equipementSet.has(equip)) return false;
    }

    // 3. Filtre type de repas (optionnel)
    if (
      constraints.type_repas_requis !== undefined &&
      !recette.type_repas.includes(constraints.type_repas_requis)
    ) {
      return false;
    }

    return true;
  });
}
