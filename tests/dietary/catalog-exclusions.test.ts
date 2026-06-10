import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { IngredientSchema, RecetteInputSchema } from '../../src/lib/types/schemas';
import type { IngredientOutput, RecetteOutput } from '../../src/lib/types/schemas';
import { computeDietaryMetadata } from '../../src/lib/dietary/compute';

const ROOT = join(process.cwd(), 'data');

function loadIngredient(id: string): IngredientOutput {
  const raw = readFileSync(join(ROOT, 'ingredients', `${id}.yaml`), 'utf-8');
  return IngredientSchema.parse(parseYaml(raw));
}

function loadRecipe(id: string): RecetteOutput {
  const raw = readFileSync(join(ROOT, 'recettes', `${id}.yaml`), 'utf-8');
  return RecetteInputSchema.parse(parseYaml(raw));
}

function ingredientsMapFor(recette: RecetteOutput): Map<string, IngredientOutput> {
  const ids = [...new Set(recette.ingredients.map((ri) => ri.ingredient_id))];
  return new Map(ids.map((id) => [id, loadIngredient(id)]));
}

describe('exclusions_compatibles — catalogue réel', () => {
  it("quiche-lorraine (contient lardon-fume) n'est pas compatible sans-porc", () => {
    const recette = loadRecipe('quiche-lorraine');
    const map = ingredientsMapFor(recette);

    const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
    expect(exclusions_compatibles).not.toContain('sans-porc');
  });

  it("poke-bowl-saumon (contient saumon-frais) n'est pas compatible sans-poisson", () => {
    const recette = loadRecipe('poke-bowl-saumon');
    const map = ingredientsMapFor(recette);

    const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
    expect(exclusions_compatibles).not.toContain('sans-poisson');
  });
});
