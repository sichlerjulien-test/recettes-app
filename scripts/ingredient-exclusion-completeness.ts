import type { IngredientOutput } from '../src/lib/types/schemas';

const REQUIRED_EXCLUSION_TAGS_BY_ALLERGEN = [
  {
    allergen: 'poissons',
    tag: 'sans-poisson',
  },
  {
    allergen: 'crustaces',
    tag: 'sans-fruits-de-mer',
  },
  {
    allergen: 'mollusques',
    tag: 'sans-fruits-de-mer',
  },
] as const;

export function validateIngredientExclusionCompleteness(
  ingredients: Map<string, IngredientOutput>,
): string[] {
  const errors: string[] = [];

  for (const [id, ingredient] of ingredients) {
    for (const rule of REQUIRED_EXCLUSION_TAGS_BY_ALLERGEN) {
      if (
        ingredient.allergenes.includes(rule.allergen) &&
        !ingredient.exclusion_tags.includes(rule.tag)
      ) {
        errors.push(
          `[${id}.yaml] allergène "${rule.allergen}" exige exclusion_tags: "${rule.tag}"`,
        );
      }
    }
  }

  return errors;
}
