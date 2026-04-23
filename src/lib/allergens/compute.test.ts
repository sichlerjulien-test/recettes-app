import { describe, expect, it } from 'vitest';
import type { Recette } from '@/lib/types/domain';
import { ingredientsMap } from '../../../tests/fixtures/ingredients';
import { getRecette } from '../../../tests/fixtures/recettes';
import { computeRecipeMetadata } from './compute';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'est_vegetarien' | 'est_vegan'>;

function strip(r: Recette): RecetteSansCalculs {
  const { allergenes_calcules: _a, est_vegetarien: _v, est_vegan: _vv, ...rest } = r;
  return rest;
}

describe('computeRecipeMetadata', () => {

  it('doit retourner le seul allergene quand un ingredient contient 1 allergene', () => {
    const result = computeRecipeMetadata(strip(getRecette('omelette-legumes')), ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual(['oeufs']);
  });

  it("doit retourner l'union dedupliquee des allergenes pour une recette a ingredients varies", () => {
    const result = computeRecipeMetadata(strip(getRecette('carbonara-classique')), ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual(['gluten', 'lait', 'oeufs']);
  });

  it("doit exclure un ingredient optionnel allergene de allergenes_calcules", () => {
    // parmesan (lait) est optionnel dans carbonara-sans-parmesan
    const result = computeRecipeMetadata(strip(getRecette('carbonara-sans-parmesan')), ingredientsMap);
    expect(result.allergenes_calcules).not.toContain('lait');
    expect(result.allergenes_calcules).toStrictEqual(['gluten', 'oeufs']);
  });

  it("doit inclure un ingredient non-optionnel allergene dans allergenes_calcules", () => {
    // parmesan (lait) est non-optionnel dans carbonara-classique
    const result = computeRecipeMetadata(strip(getRecette('carbonara-classique')), ingredientsMap);
    expect(result.allergenes_calcules).toContain('lait');
  });

  it("doit retourner un tableau vide quand aucun ingredient n'a d'allergene", () => {
    const result = computeRecipeMetadata(strip(getRecette('salade-tomate-basilic')), ingredientsMap);
    expect(result.allergenes_calcules).toStrictEqual([]);
  });

  it('doit dedupliquer les allergenes identiques de plusieurs ingredients', () => {
    // burger-maison : pain-de-mie (gluten+lait) + boeuf-hache (aucun) -> gluten et lait chacun une fois
    const result = computeRecipeMetadata(strip(getRecette('burger-maison')), ingredientsMap);
    const glutenCount = result.allergenes_calcules.filter((a) => a === 'gluten').length;
    const laitCount = result.allergenes_calcules.filter((a) => a === 'lait').length;
    expect(glutenCount).toBe(1);
    expect(laitCount).toBe(1);
  });

  it('doit retourner les allergenes tries alphabetiquement', () => {
    // carbonara-classique contient lait, gluten, oeufs -> ordre alpha attendu
    const result = computeRecipeMetadata(strip(getRecette('carbonara-classique')), ingredientsMap);
    const sorted = [...result.allergenes_calcules].sort();
    expect(result.allergenes_calcules).toStrictEqual(sorted);
  });

  it('doit retourner est_vegan=true et est_vegetarien=true pour une recette vegan', () => {
    const result = computeRecipeMetadata(strip(getRecette('salade-tomate-basilic')), ingredientsMap);
    expect(result.est_vegan).toBe(true);
    expect(result.est_vegetarien).toBe(true);
  });

  it('doit retourner est_vegetarien=true et est_vegan=false pour une recette avec oeufs', () => {
    // omelette-legumes : ingredient_principal='oeufs' -> non-vegan, mais vegetarien
    const result = computeRecipeMetadata(strip(getRecette('omelette-legumes')), ingredientsMap);
    expect(result.est_vegetarien).toBe(true);
    expect(result.est_vegan).toBe(false);
  });

  it('doit retourner est_vegetarien=false et est_vegan=false pour une recette carnee', () => {
    const result = computeRecipeMetadata(strip(getRecette('pates-bolognaise')), ingredientsMap);
    expect(result.est_vegetarien).toBe(false);
    expect(result.est_vegan).toBe(false);
  });

  it("doit lancer une erreur avec l'id manquant quand un ingredient_id est inexistant", () => {
    const recette: RecetteSansCalculs = {
      ...strip(getRecette('salade-tomate-basilic')),
      id: 'recette-test-manquant',
      ingredients: [
        { ingredient_id: 'ingredient-inexistant-xyz', quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    expect(() => computeRecipeMetadata(recette, ingredientsMap))
      .toThrow('ingredient-inexistant-xyz');
  });

  it("doit fonctionner sans erreur ni mutation si l'input est gele via Object.freeze", () => {
    const recette = strip(getRecette('riz-saute-legumes'));
    const frozen = Object.freeze({
      ...recette,
      ingredients: Object.freeze([...recette.ingredients]) as Recette['ingredients'],
    }) as RecetteSansCalculs;

    expect(() => computeRecipeMetadata(frozen, ingredientsMap)).not.toThrow();
    // Verifier que l'objet gele n'a pas ete mute (les proprietes sont inchangees)
    expect(frozen.id).toBe('riz-saute-legumes');
    expect(frozen.ingredients).toHaveLength(3);
  });

});
