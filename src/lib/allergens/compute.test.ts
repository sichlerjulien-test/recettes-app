import { describe, expect, it } from 'vitest';
import type { Recette } from '@/lib/types/domain';
import { ingredientsMap } from '../../../tests/fixtures/ingredients';
import { computeRecipeMetadata } from './compute';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'est_vegetarien' | 'est_vegan'>;

// Recettes construites à la main pour les tests unitaires de computeRecipeMetadata.
// Ne pas importer depuis tests/fixtures/recettes — les fixtures utilisent computeRecipeMetadata
// au build ; les tests unitaires de cette fonction doivent rester indépendants.

const BASE = {
  description: '',
  portions_base: 4,
  duree_minutes: 20,
  duree_active: 20,
  difficulte: 'facile' as const,
  equipement: ['plaque' as const],
  type_repas: ['midi' as const, 'soir' as const],
  type_cuisine: 'neutre' as const,
  saison: ['toutes' as const],
  feculent_dominant: 'aucun' as const,
  etapes: [],
  tags_libres: [],
};

const OMELETTE: RecetteSansCalculs = {
  ...BASE,
  id: 'test-omelette',
  nom: 'Omelette test',
  ingredient_principal: 'oeufs',
  ingredients: [
    { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
    { ingredient_id: 'oignon',      quantite_base: 100, unite: 'g',     optionnel: false, groupe: undefined },
  ],
};

const CARBONARA: RecetteSansCalculs = {
  ...BASE,
  id: 'test-carbonara',
  nom: 'Carbonara test',
  ingredient_principal: 'porc',
  feculent_dominant: 'pates',
  ingredients: [
    { ingredient_id: 'penne',       quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
    { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
    { ingredient_id: 'parmesan',    quantite_base: 80,  unite: 'g',     optionnel: false, groupe: undefined },
  ],
};

const CARBONARA_SANS_PARMESAN: RecetteSansCalculs = {
  ...BASE,
  id: 'test-carbonara-sans-parmesan',
  nom: 'Carbonara sans parmesan test',
  ingredient_principal: 'porc',
  feculent_dominant: 'pates',
  ingredients: [
    { ingredient_id: 'penne',       quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
    { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
    { ingredient_id: 'parmesan',    quantite_base: 80,  unite: 'g',     optionnel: true,  groupe: 'garniture' },
  ],
};

const SALADE_VEGAN: RecetteSansCalculs = {
  ...BASE,
  id: 'test-salade-vegan',
  nom: 'Salade vegan test',
  ingredient_principal: 'legumes',
  ingredients: [
    { ingredient_id: 'tomate',  quantite_base: 600, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'oignon',  quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'carotte', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
  ],
};

const BURGER: RecetteSansCalculs = {
  ...BASE,
  id: 'test-burger',
  nom: 'Burger test',
  ingredient_principal: 'boeuf',
  feculent_dominant: 'pain',
  ingredients: [
    { ingredient_id: 'pain-de-mie', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
    { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
    { ingredient_id: 'tomate',      quantite_base: 200, unite: 'g',     optionnel: false, groupe: undefined },
  ],
};

const RIZ_LEGUMES: RecetteSansCalculs = {
  ...BASE,
  id: 'test-riz-legumes',
  nom: 'Riz sauté test',
  ingredient_principal: 'legumes',
  feculent_dominant: 'riz',
  ingredients: [
    { ingredient_id: 'riz-basmati', quantite_base: 300, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'tomate',      quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'carotte',     quantite_base: 150, unite: 'g', optionnel: false, groupe: undefined },
  ],
};

const BOLOGNAISE: RecetteSansCalculs = {
  ...BASE,
  id: 'test-bolognaise',
  nom: 'Bolognaise test',
  ingredient_principal: 'boeuf',
  feculent_dominant: 'pates',
  ingredients: [
    { ingredient_id: 'penne',       quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'tomate',      quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
    { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
  ],
};

describe('computeRecipeMetadata', () => {

  it('doit retourner le seul allergene quand un ingredient contient 1 allergene', () => {
    const result = computeRecipeMetadata(OMELETTE, ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual(['oeufs']);
  });

  it("doit retourner l'union dedupliquee des allergenes pour une recette a ingredients varies", () => {
    const result = computeRecipeMetadata(CARBONARA, ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual(['gluten', 'lait', 'oeufs']);
  });

  it("doit exclure un ingredient optionnel allergene de allergenes_calcules", () => {
    const result = computeRecipeMetadata(CARBONARA_SANS_PARMESAN, ingredientsMap);
    expect(result.allergenes_calcules).not.toContain('lait');
    expect(result.allergenes_calcules).toStrictEqual(['gluten', 'oeufs']);
  });

  it("doit inclure un ingredient non-optionnel allergene dans allergenes_calcules", () => {
    const result = computeRecipeMetadata(CARBONARA, ingredientsMap);
    expect(result.allergenes_calcules).toContain('lait');
  });

  it("doit retourner un tableau vide quand aucun ingredient n'a d'allergene", () => {
    const result = computeRecipeMetadata(SALADE_VEGAN, ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual([]);
  });

  it('doit dedupliquer les allergenes identiques de plusieurs ingredients', () => {
    // burger : pain-de-mie (gluten+lait) + boeuf-hache (aucun) -> gluten et lait chacun une fois
    const result = computeRecipeMetadata(BURGER, ingredientsMap);
    const glutenCount = result.allergenes_calcules.filter((a) => a === 'gluten').length;
    const laitCount = result.allergenes_calcules.filter((a) => a === 'lait').length;
    expect(glutenCount).toBe(1);
    expect(laitCount).toBe(1);
  });

  it('doit retourner les allergenes tries alphabetiquement', () => {
    const result = computeRecipeMetadata(CARBONARA, ingredientsMap);
    const sorted = [...result.allergenes_calcules].sort();
    expect(result.allergenes_calcules).toStrictEqual(sorted);
  });

  it('doit retourner est_vegan=true et est_vegetarien=true pour une recette vegan', () => {
    const result = computeRecipeMetadata(SALADE_VEGAN, ingredientsMap);
    expect(result.est_vegan).toBe(true);
    expect(result.est_vegetarien).toBe(true);
  });

  it('doit retourner est_vegetarien=true et est_vegan=false pour une recette avec oeufs', () => {
    // ingredient_principal='oeufs' -> non-vegan (MAIN_INGREDIENTS_NON_VEGAN), mais vegetarien
    const result = computeRecipeMetadata(OMELETTE, ingredientsMap);
    expect(result.est_vegetarien).toBe(true);
    expect(result.est_vegan).toBe(false);
  });

  it('doit retourner est_vegetarien=false et est_vegan=false pour une recette carnee', () => {
    const result = computeRecipeMetadata(BOLOGNAISE, ingredientsMap);
    expect(result.est_vegetarien).toBe(false);
    expect(result.est_vegan).toBe(false);
  });

  it("doit lancer une erreur avec l'id manquant quand un ingredient_id est inexistant", () => {
    const recette: RecetteSansCalculs = {
      ...SALADE_VEGAN,
      id: 'test-ingredient-manquant',
      ingredients: [
        { ingredient_id: 'ingredient-inexistant-xyz', quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    expect(() => computeRecipeMetadata(recette, ingredientsMap))
      .toThrow('ingredient-inexistant-xyz');
  });

  it("doit fonctionner sans erreur ni mutation si l'input est gele via Object.freeze", () => {
    const frozen = Object.freeze({
      ...RIZ_LEGUMES,
      ingredients: Object.freeze([...RIZ_LEGUMES.ingredients]) as Recette['ingredients'],
    }) as RecetteSansCalculs;

    expect(() => computeRecipeMetadata(frozen, ingredientsMap)).not.toThrow();
    expect(frozen.id).toBe('test-riz-legumes');
    expect(frozen.ingredients).toHaveLength(3);
  });

});
