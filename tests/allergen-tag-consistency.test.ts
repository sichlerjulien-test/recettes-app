import { describe, expect, it } from 'vitest';
import { validateAllergenTagConsistency } from '../scripts/allergen-tag-consistency';

describe('validateAllergenTagConsistency', () => {
  it('échoue si sans-gluten est posé alors que gluten est dans allergenes_calcules', () => {
    const errors = validateAllergenTagConsistency(
      'houmous-mezze',
      ['vegan', 'sans-gluten'],
      ['gluten', 'sesame'],
    );

    expect(errors).toStrictEqual([
      '[houmous-mezze] tag "sans-gluten" incohérent : l\'allergène "gluten" est présent dans allergenes_calcules',
    ]);
  });

  it("n'échoue pas si la recette est réellement sans gluten", () => {
    const errors = validateAllergenTagConsistency(
      'houmous-mezze',
      ['vegan', 'sans-gluten'],
      ['sesame'],
    );

    expect(errors).toStrictEqual([]);
  });

  it('ignore les tags qui ne sont pas des slugs EU14 (sans-porc, sans-viande-rouge…)', () => {
    const errors = validateAllergenTagConsistency(
      'poulet-basquaise',
      ['sans-porc', 'sans-viande-rouge', 'rapide'],
      ['gluten'],
    );

    expect(errors).toStrictEqual([]);
  });

  it('détecte plusieurs incohérences sur la même recette', () => {
    const errors = validateAllergenTagConsistency(
      'test-multi',
      ['sans-gluten', 'sans-lait'],
      ['gluten', 'lait'],
    );

    expect(errors).toHaveLength(2);
  });
});
