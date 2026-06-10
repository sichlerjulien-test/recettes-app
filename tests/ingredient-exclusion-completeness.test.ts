import { describe, expect, it } from 'vitest';
import { validateIngredientExclusionCompleteness } from '../scripts/ingredient-exclusion-completeness';
import { IngredientSchema, type IngredientOutput } from '../src/lib/types/schemas';

function ingredient(
  overrides: Partial<IngredientOutput> & Pick<IngredientOutput, 'id'>,
): IngredientOutput {
  return IngredientSchema.parse({
    id: overrides.id,
    nom_singulier: overrides.nom_singulier ?? overrides.id,
    nom_pluriel: overrides.nom_pluriel ?? overrides.id,
    categorie: overrides.categorie ?? 'condiments-epices',
    unite_base: overrides.unite_base ?? 'g',
    unite_achat: overrides.unite_achat ?? 'g',
    conversion: overrides.conversion ?? 1,
    allergenes: overrides.allergenes ?? [],
    contient_trace: overrides.contient_trace ?? [],
    substituts: overrides.substituts ?? [],
    exclusion_tags: overrides.exclusion_tags ?? [],
    saisonnalite: overrides.saisonnalite,
    notes: overrides.notes,
  });
}

describe('validateIngredientExclusionCompleteness', () => {
  it('échoue pour un allergène poisson sans tag, même hors viandes-poissons', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['nuoc-mam', ingredient({ id: 'nuoc-mam', allergenes: ['poissons'] })],
    ]));

    expect(errors).toStrictEqual([
      '[nuoc-mam.yaml] allergène "poissons" exige exclusion_tags: "sans-poisson"',
    ]);
  });

  it('échoue pour crustacés et mollusques sans sans-fruits-de-mer', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['crevettes', ingredient({ id: 'crevettes', allergenes: ['crustaces'] })],
      ['moules', ingredient({ id: 'moules', allergenes: ['mollusques'] })],
    ]));

    expect(errors).toStrictEqual([
      '[crevettes.yaml] allergène "crustaces" exige exclusion_tags: "sans-fruits-de-mer"',
      '[moules.yaml] allergène "mollusques" exige exclusion_tags: "sans-fruits-de-mer"',
    ]);
  });

  it('accepte les ingrédients correctement tagués', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['saumon', ingredient({
        id: 'saumon',
        allergenes: ['poissons'],
        exclusion_tags: ['sans-poisson'],
      })],
      ['moules', ingredient({
        id: 'moules',
        allergenes: ['mollusques'],
        exclusion_tags: ['sans-fruits-de-mer'],
      })],
    ]));

    expect(errors).toStrictEqual([]);
  });
});
