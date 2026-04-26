import type { Allergen } from '../../../data/seed-allergenes';
import type { Ingredient, MainIngredient, Recette } from '../types/domain';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'est_vegetarien' | 'est_vegan'>;

const MAIN_INGREDIENTS_NON_VEGETARIEN = new Set<MainIngredient>([
  'poulet', 'boeuf', 'porc', 'agneau', 'poisson', 'fruits-de-mer',
]);

const CATEGORIES_NON_VEGAN = new Set(['viandes-poissons', 'cremerie-oeufs'] as const);

const MAIN_INGREDIENTS_NON_VEGAN = new Set<MainIngredient>(['oeufs', 'fromage']);

/**
 * Calcule les métadonnées dérivées d'une recette à partir de ses ingrédients.
 *
 * Cette fonction est appelée au build pour peupler les champs calculés de
 * chaque recette. Elle ne doit jamais être appelée à la volée en runtime.
 *
 * @param recette - La recette sans ses champs calculés
 * @param ingredientsMap - Index de tous les ingrédients connus, clé = ingredient_id
 * @returns Les trois champs calculés : allergenes_calcules, est_vegetarien, est_vegan
 * @throws Error si un ingredient_id référencé n'existe pas dans ingredientsMap
 *
 * IMPORTANT : les ingrédients marqués optionnel: true sont EXCLUS du calcul de
 * allergenes_calcules. Décision produit : un ingrédient optionnel peut être omis par
 * l'utilisateur final, il ne doit donc pas déclencher l'exclusion d'une recette pour
 * un allergique.
 *
 * @example
 * const meta = computeRecipeMetadata(recette, new Map(ingredients.map(i => [i.id, i])));
 * // meta.allergenes_calcules => ['gluten', 'lait']
 * // meta.est_vegetarien => false
 * // meta.est_vegan => false
 */
export function computeRecipeMetadata(
  recette: RecetteSansCalculs,
  ingredientsMap: Map<string, Ingredient>,
): {
  allergenes_calcules: Allergen[];
  est_vegetarien: boolean;
  est_vegan: boolean;
} {
  const allergeneSet = new Set<Allergen>();
  let hasNonVeganCategory = false;

  for (const ri of recette.ingredients) {
    if (ri.optionnel) continue;

    const ingredient = ingredientsMap.get(ri.ingredient_id);
    if (ingredient === undefined) {
      throw new Error(
        `Ingrédient inexistant référencé par ${recette.id} : ${ri.ingredient_id}`,
      );
    }

    for (const allergen of ingredient.allergenes) {
      allergeneSet.add(allergen);
    }

    if (CATEGORIES_NON_VEGAN.has(ingredient.categorie as 'viandes-poissons' | 'cremerie-oeufs')) {
      hasNonVeganCategory = true;
    }
  }

  const allergenes_calcules = [...allergeneSet].sort();

  const est_vegetarien = !MAIN_INGREDIENTS_NON_VEGETARIEN.has(recette.ingredient_principal);

  const est_vegan =
    est_vegetarien &&
    !hasNonVeganCategory &&
    !MAIN_INGREDIENTS_NON_VEGAN.has(recette.ingredient_principal);

  return { allergenes_calcules, est_vegetarien, est_vegan };
}
