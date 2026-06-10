import type { Allergen } from '../../../data/seed-allergenes';
import type { Ingredient, Recette } from '../types/domain';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'exclusions_compatibles'>;

/**
 * Calcule les allergènes dérivés d'une recette à partir de ses ingrédients.
 *
 * Cette fonction est appelée au build pour peupler le champ allergenes_calcules
 * de chaque recette. Elle ne doit jamais être appelée à la volée en runtime.
 *
 * @param recette - La recette sans ses champs calculés
 * @param ingredientsMap - Index de tous les ingrédients connus, clé = ingredient_id
 * @returns Les allergènes calculés triés alphabétiquement
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
 */
export function computeRecipeMetadata(
  recette: RecetteSansCalculs,
  ingredientsMap: Map<string, Ingredient>,
): {
  allergenes_calcules: Allergen[];
} {
  const allergeneSet = new Set<Allergen>();

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
  }

  const allergenes_calcules = [...allergeneSet].sort();

  return { allergenes_calcules };
}
