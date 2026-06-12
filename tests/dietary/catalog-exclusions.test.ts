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

// ─── Listes dorées — IDs réels du catalogue, écrits à la main ────────────────
// La vérité est dans ces listes, pas dans computeDietaryMetadata.
// Si la computation diverge, le test casse et révèle le bug.

/** Recettes carnées : doivent être ∉ pool vegetarien ET ∉ pool vegan. */
const KNOWN_MEAT_FISH_RECIPES = [
  'boeuf-bourguignon',  // ingredient_principal: boeuf
  'poulet-roti-four',   // ingredient_principal: poulet
  'quiche-lorraine',    // ingredient_principal: oeufs — TRACE : lardon-fume (viandes-poissons)
  'poke-bowl-saumon',   // ingredient_principal: poisson (poisson)
  'moules-mariniere',   // ingredient_principal: poisson — moules-bouchot (fruits de mer, viandes-poissons)
] as const;

/**
 * Recettes avec crémerie/œufs, zéro viande : ∈ pool vegetarien, ∉ pool vegan.
 * Ces recettes isolent vegan de vegetarien — le trou signalé en revue.
 */
const KNOWN_DAIRY_EGG_RECIPES = [
  'gratin-courgettes-chevre', // fromage + oeuf + crème, zéro viande
  'omelette-herbes',          // oeuf non-optionnel, parmesan optionnel ignoré, zéro viande
  'oeufs-brouilles-toast',    // oeuf + beurre + crème fraîche, zéro viande
] as const;

/**
 * Recettes réellement vegan : ∈ pool vegetarien ET ∈ pool vegan.
 * Contrôle positif — garantit que les deux pools ne sont pas vides.
 */
const KNOWN_VEGAN_RECIPES = [
  'buddha-bowl-quinoa',   // légumineuses, zéro produit animal
  'pates-tomate-basilic', // légumes, zéro produit animal
] as const;

// ─── Régression croque-monsieur-salade (TK-05 bug) ──────────────────────────
// jambon-blanc était en frais-traiteur → croque-monsieur passait en végétarien.
// Après correction de la catégorie vers viandes-poissons, les deux propriétés
// doivent être absentes.

describe('régression croque-monsieur-salade', () => {
  it("n'est pas végétarien (contient jambon-blanc)", () => {
    const recette = loadRecipe('croque-monsieur-salade');
    const map = ingredientsMapFor(recette);
    const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
    expect(exclusions_compatibles).not.toContain('vegetarien');
  });

  it("n'est pas compatible sans-porc (contient jambon-blanc)", () => {
    const recette = loadRecipe('croque-monsieur-salade');
    const map = ingredientsMapFor(recette);
    const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
    expect(exclusions_compatibles).not.toContain('sans-porc');
  });
});

// ─── Anciens tests (conservés) ───────────────────────────────────────────────

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

// ─── Listes dorées — oracle indépendant ──────────────────────────────────────
// Ces assertions confrontent computeDietaryMetadata à une vérité externe (labels
// humains). Un bug dans la computation fait diverger label et résultat → test rouge.

describe('listes dorées — oracle indépendant', () => {

  it('KNOWN_MEAT_FISH_RECIPES : aucune ne passe le filtre vegetarien ni vegan', () => {
    for (const id of KNOWN_MEAT_FISH_RECIPES) {
      const recette = loadRecipe(id);
      const map = ingredientsMapFor(recette);
      const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
      expect(exclusions_compatibles, `${id} ne doit pas être vegetarien`).not.toContain('vegetarien');
      expect(exclusions_compatibles, `${id} ne doit pas être vegan`).not.toContain('vegan');
    }
  });

  it('KNOWN_DAIRY_EGG_RECIPES : ∈ pool vegetarien ET ∉ pool vegan', () => {
    for (const id of KNOWN_DAIRY_EGG_RECIPES) {
      const recette = loadRecipe(id);
      const map = ingredientsMapFor(recette);
      const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
      expect(exclusions_compatibles, `${id} doit être vegetarien`).toContain('vegetarien');
      expect(exclusions_compatibles, `${id} ne doit pas être vegan (contient crémerie/œufs)`).not.toContain('vegan');
    }
  });

  it('KNOWN_VEGAN_RECIPES : ∈ pool vegetarien ET ∈ pool vegan (contrôle positif)', () => {
    for (const id of KNOWN_VEGAN_RECIPES) {
      const recette = loadRecipe(id);
      const map = ingredientsMapFor(recette);
      const { exclusions_compatibles } = computeDietaryMetadata(recette, map);
      expect(exclusions_compatibles, `${id} doit être vegetarien`).toContain('vegetarien');
      expect(exclusions_compatibles, `${id} doit être vegan`).toContain('vegan');
    }
  });

});

// ─── Oracle secondaire — scan ingredient.categorie ───────────────────────────
// Lit ingredient.categorie en direct sur le catalogue YAML, sans passer par
// computeDietaryMetadata. Toute divergence entre les deux sources détecte un bug
// soit dans la computation, soit dans les données.

describe('oracle secondaire — scan ingredient.categorie', () => {

  it('pool vegetarien : aucun ingrédient non-optionnel n\'a categorie viandes-poissons', () => {
    const allRecettes = loadAllRecettes();
    const allIngredients = loadAllIngredients();
    const pool = allRecettes.filter((r) => r.exclusions_compatibles.includes('vegetarien'));

    expect(pool.length, 'le pool vegetarien ne doit pas être vide').toBeGreaterThan(0);

    for (const r of pool) {
      for (const ri of r.ingredients) {
        if (ri.optionnel) continue;
        const ingredient = allIngredients.get(ri.ingredient_id);
        if (ingredient === undefined) continue;
        expect(
          ingredient.categorie,
          `${r.id} → ${ri.ingredient_id} (categorie: ${ingredient.categorie}) est dans le pool vegetarien mais a categorie viandes-poissons`,
        ).not.toBe('viandes-poissons');
      }
    }
  });

  it('pool vegan : aucun ingrédient non-optionnel n\'a categorie viandes-poissons ou cremerie-oeufs', () => {
    const allRecettes = loadAllRecettes();
    const allIngredients = loadAllIngredients();
    const pool = allRecettes.filter((r) => r.exclusions_compatibles.includes('vegan'));

    expect(pool.length, 'le pool vegan ne doit pas être vide').toBeGreaterThan(0);

    for (const r of pool) {
      for (const ri of r.ingredients) {
        if (ri.optionnel) continue;
        const ingredient = allIngredients.get(ri.ingredient_id);
        if (ingredient === undefined) continue;
        expect(
          ingredient.categorie,
          `${r.id} → ${ri.ingredient_id} (categorie: ${ingredient.categorie}) est dans le pool vegan mais a categorie viandes-poissons`,
        ).not.toBe('viandes-poissons');
        expect(
          ingredient.categorie,
          `${r.id} → ${ri.ingredient_id} (categorie: ${ingredient.categorie}) est dans le pool vegan mais a categorie cremerie-oeufs`,
        ).not.toBe('cremerie-oeufs');
      }
    }
  });

});
