import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { IngredientSchema, RecetteInputSchema } from '../../src/lib/types/schemas';
import type { IngredientOutput, RecetteOutput } from '../../src/lib/types/schemas';
import type { ExclusionTag } from '../../src/lib/types/domain';
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

type EnrichedRecette = RecetteOutput & { exclusions_compatibles: ExclusionTag[] };

function loadAllIngredients(): Map<string, IngredientOutput> {
  const dir = join(ROOT, 'ingredients');
  const map = new Map<string, IngredientOutput>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const raw = readFileSync(join(dir, file), 'utf-8');
    const ingredient = IngredientSchema.parse(parseYaml(raw));
    map.set(ingredient.id, ingredient);
  }
  return map;
}

function loadAllRecettes(): EnrichedRecette[] {
  const allIngredients = loadAllIngredients();
  const dir = join(ROOT, 'recettes');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((file) => {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const recette = RecetteInputSchema.parse(parseYaml(raw));
      const { exclusions_compatibles } = computeDietaryMetadata(recette, allIngredients);
      return { ...recette, exclusions_compatibles };
    });
}

const MEAT_PRINCIPALS = new Set([
  'poulet', 'boeuf', 'porc', 'agneau', 'poisson', 'fruits-de-mer',
] as const);

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

// ─── Preuves moteur — catalogue réel complet ─────────────────────────────────
// Ces tests prouvent la sortie du moteur (zéro viande dans le pool végétarien)
// sur le catalogue YAML de prod, sans LLM, de façon déterministe.

describe('preuves moteur — catalogue réel complet', () => {

  it('vegetarien : le pool filtré ne contient aucune recette avec viande, volaille ou poisson', () => {
    const catalogue = loadAllRecettes();
    const pool = catalogue.filter((r) => r.exclusions_compatibles.includes('vegetarien'));

    // Contrôle positif : le filtre retourne au moins une recette
    expect(pool.length).toBeGreaterThan(0);

    // Garantie moteur : aucune recette carnée (volaille et porc inclus, pas seulement bœuf)
    for (const r of pool) {
      const hasViande = (MEAT_PRINCIPALS as Set<string>).has(r.ingredient_principal);
      expect(hasViande, `${r.id} (ingredient_principal: ${r.ingredient_principal}) ne doit pas passer le filtre vegetarien`).toBe(false);
    }
  });

  it('sans-viande-rouge isolé : une recette bœuf ∉ pool, une recette poulet ∈ pool', () => {
    const catalogue = loadAllRecettes();

    const boeufRecettes = catalogue.filter((r) => r.ingredient_principal === 'boeuf');
    const pouletRecettes = catalogue.filter((r) => r.ingredient_principal === 'poulet');

    // Garantie : aucune recette bœuf n'est compatible sans-viande-rouge
    expect(boeufRecettes.length).toBeGreaterThan(0);
    for (const r of boeufRecettes) {
      expect(r.exclusions_compatibles, `${r.id} (boeuf) ne doit pas être compatible sans-viande-rouge`).not.toContain('sans-viande-rouge');
    }

    // Garantie : au moins une recette poulet est compatible sans-viande-rouge
    // (le poulet n'est pas de la viande rouge — contrôle l'isolation du tag)
    expect(pouletRecettes.length).toBeGreaterThan(0);
    const pouletCompatibles = pouletRecettes.filter((r) =>
      r.exclusions_compatibles.includes('sans-viande-rouge'),
    );
    expect(
      pouletCompatibles.length,
      `Trou catalogue : aucune recette poulet compatible sans-viande-rouge trouvée parmi [${pouletRecettes.map((r) => r.id).join(', ')}]`,
    ).toBeGreaterThan(0);
  });

});
