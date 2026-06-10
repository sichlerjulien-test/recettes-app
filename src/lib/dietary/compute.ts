import type { ExclusionTag } from '../types/domain';
import type { Ingredient, MainIngredient, Recette } from '../types/domain';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'exclusions_compatibles'>;

const MAIN_INGREDIENTS_NON_VEGETARIEN = new Set<MainIngredient>([
  'poulet', 'boeuf', 'porc', 'agneau',
  'poisson', 'fruits-de-mer',
]);

const CATEGORIES_NON_VEGAN = new Set(['viandes-poissons', 'cremerie-oeufs'] as const);

const MAIN_INGREDIENTS_NON_VEGAN = new Set<MainIngredient>(['oeufs', 'fromage']);

export function computeDietaryMetadata(
  recette: RecetteSansCalculs,
  ingredientsMap: Map<string, Ingredient>,
): { exclusions_compatibles: ExclusionTag[] } {
  let hasNonVeganCategory = false;

  for (const ri of recette.ingredients) {
    if (ri.optionnel) continue;

    const ingredient = ingredientsMap.get(ri.ingredient_id);
    if (ingredient === undefined) continue;

    if (CATEGORIES_NON_VEGAN.has(ingredient.categorie as 'viandes-poissons' | 'cremerie-oeufs')) {
      hasNonVeganCategory = true;
    }
  }

  const est_vegetarien = !MAIN_INGREDIENTS_NON_VEGETARIEN.has(recette.ingredient_principal);

  const est_vegan =
    est_vegetarien &&
    !hasNonVeganCategory &&
    !MAIN_INGREDIENTS_NON_VEGAN.has(recette.ingredient_principal);

  const exclusions_compatibles: ExclusionTag[] = [
    ...(est_vegetarien ? (['vegetarien'] as const) : []),
    ...(est_vegan ? (['vegan'] as const) : []),
  ];

  return { exclusions_compatibles };
}
