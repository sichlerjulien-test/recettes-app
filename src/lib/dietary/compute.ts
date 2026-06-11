import type { ExclusionTag } from '../types/domain';
import type { Ingredient, MainIngredient, Recette } from '../types/domain';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'exclusions_compatibles'>;

const ATOMIC_EXCLUSION_TAGS = [
  'sans-viande-rouge',
  'sans-porc',
  'sans-poisson',
  'sans-fruits-de-mer',
  'sans-alcool',
] as const satisfies readonly ExclusionTag[];

const MAIN_INGREDIENTS_NON_VEGETARIEN = new Set<MainIngredient>([
  'poulet', 'boeuf', 'porc', 'agneau',
  'poisson', 'fruits-de-mer',
]);


const MAIN_INGREDIENTS_NON_VEGAN = new Set<MainIngredient>(['oeufs', 'fromage']);

export function computeDietaryMetadata(
  recette: RecetteSansCalculs,
  ingredientsMap: Map<string, Ingredient>,
): { exclusions_compatibles: ExclusionTag[] } {
  let hasMeatOrFishIngredient = false;
  let hasDairyOrEggIngredient = false;
  const blockedAtomicTags = new Set<ExclusionTag>();

  for (const ri of recette.ingredients) {
    if (ri.optionnel) continue;

    const ingredient = ingredientsMap.get(ri.ingredient_id);
    if (ingredient === undefined) continue;

    if (ingredient.categorie === 'viandes-poissons') {
      hasMeatOrFishIngredient = true;
    }
    if (ingredient.categorie === 'cremerie-oeufs') {
      hasDairyOrEggIngredient = true;
    }

    for (const tag of ingredient.exclusion_tags) {
      blockedAtomicTags.add(tag);
    }
  }

  const est_vegetarien =
    !MAIN_INGREDIENTS_NON_VEGETARIEN.has(recette.ingredient_principal) &&
    !hasMeatOrFishIngredient;

  const est_vegan =
    est_vegetarien &&
    !hasDairyOrEggIngredient &&
    !MAIN_INGREDIENTS_NON_VEGAN.has(recette.ingredient_principal);

  const exclusions_compatibles: ExclusionTag[] = [
    ...ATOMIC_EXCLUSION_TAGS.filter((tag) => !blockedAtomicTags.has(tag)),
    ...(est_vegetarien ? (['vegetarien'] as const) : []),
    ...(est_vegan ? (['vegan'] as const) : []),
  ];

  return { exclusions_compatibles };
}
