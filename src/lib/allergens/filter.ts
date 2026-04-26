import type { Allergen, DietaryRestriction } from '../../../data/seed-allergenes';
import type { Equipment, MealType, Recette } from '../types/domain';

/**
 * Contraintes de filtrage issues du groupe de participants et des paramètres
 * du séjour. Toutes les contraintes sont cumulatives (ET logique).
 */
export interface FilterConstraints {
  /** Union de tous les allergènes déclarés dans le groupe */
  allergenes_groupe: Allergen[];
  /** Union de tous les régimes déclarés dans le groupe */
  regimes_groupe: DietaryRestriction[];
  /** Équipements disponibles dans le gîte/lieu du séjour */
  equipement_disponible: Equipment[];
  /** Si fourni, ne garder que les recettes compatibles avec ce type de repas */
  type_repas_requis?: MealType | undefined;
}

/**
 * Filtre un catalogue de recettes selon les contraintes d'un groupe.
 *
 * Les filtres sont appliqués dans cet ordre (du plus critique au moins critique) :
 *   1. Allergènes (sécurité — ne jamais servir un allergène déclaré)
 *   2. Régime vegan
 *   3. Régime végétarien
 *   4. Équipement disponible
 *   5. Type de repas (optionnel)
 *
 * Une recette doit passer TOUS les filtres applicables pour être retenue.
 * L'ordre de résultat est celui de l'input (pas de tri implicite).
 *
 * @param recipes - Catalogue complet des recettes (non muté)
 * @param constraints - Contraintes extraites du groupe de participants
 * @returns Sous-ensemble des recettes garanties compatibles avec les contraintes
 *
 * @example
 * const pool = filterRecipes(catalogue, {
 *   allergenes_groupe: ['gluten'],
 *   regimes_groupe: ['vegetarien'],
 *   equipement_disponible: ['plaque', 'four'],
 * });
 * // pool contient uniquement les recettes sans gluten, végétariennes,
 * // et ne nécessitant que plaque et/ou four.
 */
export function filterRecipes(
  recipes: readonly Recette[],
  constraints: FilterConstraints,
): Recette[] {
  const allergeneSet = new Set(constraints.allergenes_groupe);
  const equipementSet = new Set(constraints.equipement_disponible);
  const isVegan = constraints.regimes_groupe.includes('vegan');
  const isVegetarien = constraints.regimes_groupe.includes('vegetarien');

  return recipes.filter((recette) => {
    // 1. Filtre allergènes — critique, en premier
    for (const allergen of recette.allergenes_calcules) {
      if (allergeneSet.has(allergen)) return false;
    }

    // 2. Filtre vegan
    if (isVegan && !recette.est_vegan) return false;

    // 3. Filtre végétarien (seulement si pas vegan, car vegan ⊂ végétarien)
    if (!isVegan && isVegetarien && !recette.est_vegetarien) return false;

    // 4. Filtre équipement : tous les équipements requis doivent être disponibles
    for (const equip of recette.equipement) {
      if (!equipementSet.has(equip)) return false;
    }

    // 5. Filtre type de repas (optionnel)
    if (
      constraints.type_repas_requis !== undefined &&
      !recette.type_repas.includes(constraints.type_repas_requis)
    ) {
      return false;
    }

    return true;
  });
}
