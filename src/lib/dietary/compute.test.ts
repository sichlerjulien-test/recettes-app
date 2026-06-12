import { describe, expect, it } from 'vitest';
import type { Recette } from '../types/domain';
import { ingredientsMap } from '../../../tests/fixtures/ingredients';
import { computeDietaryMetadata } from './compute';

type RecetteSansCalculs = Omit<Recette, 'allergenes_calcules' | 'exclusions_compatibles'>;

const BASE: Omit<RecetteSansCalculs, 'id' | 'nom' | 'ingredient_principal' | 'ingredients'> = {
  description: '',
  portions_base: 4,
  duree_minutes: 20,
  duree_active: 20,
  difficulte: 'facile',
  equipement: ['plaque'],
  type_repas: ['midi', 'soir'],
  type_cuisine: 'neutre',
  saison: ['toutes'],
  feculent_dominant: 'aucun',
  etapes: [],
  tags_libres: [],
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

describe('computeDietaryMetadata', () => {

  it('doit retourner exclusions_compatibles=[vegetarien, vegan] pour une recette vegan', () => {
    const result = computeDietaryMetadata(SALADE_VEGAN, ingredientsMap);
    expect(result.exclusions_compatibles).toContain('vegetarien');
    expect(result.exclusions_compatibles).toContain('vegan');
  });

  it('doit retourner exclusions_compatibles=[vegetarien] (sans vegan) pour une recette avec oeufs', () => {
    const result = computeDietaryMetadata(OMELETTE, ingredientsMap);
    expect(result.exclusions_compatibles).toContain('vegetarien');
    expect(result.exclusions_compatibles).not.toContain('vegan');
  });

  it('doit retourner exclusions_compatibles=[] pour une recette carnée', () => {
    const result = computeDietaryMetadata(BOLOGNAISE, ingredientsMap);
    expect(result.exclusions_compatibles).not.toContain('vegetarien');
    expect(result.exclusions_compatibles).not.toContain('vegan');
  });

  it('doit retourner exclusions_compatibles=[] pour une recette agneau', () => {
    const recette: RecetteSansCalculs = {
      ...BASE,
      id: 'test-agneau',
      nom: 'Gigot test',
      ingredient_principal: 'agneau',
      ingredients: [
        { ingredient_id: 'tomate', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const result = computeDietaryMetadata(recette, ingredientsMap);
    expect(result.exclusions_compatibles).not.toContain('vegetarien');
    expect(result.exclusions_compatibles).not.toContain('vegan');
  });

  it('doit retourner exclusions_compatibles=[] pour une recette fruits-de-mer', () => {
    const recette: RecetteSansCalculs = {
      ...BASE,
      id: 'test-fruits-de-mer',
      nom: 'Paella fruits de mer test',
      ingredient_principal: 'fruits-de-mer',
      ingredients: [
        { ingredient_id: 'tomate', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const result = computeDietaryMetadata(recette, ingredientsMap);
    expect(result.exclusions_compatibles).not.toContain('vegetarien');
    expect(result.exclusions_compatibles).not.toContain('vegan');
  });

  it('doit exclure un tag atomique quand un ingrédient non-optionnel le porte', () => {
    const recette: RecetteSansCalculs = {
      ...BASE,
      id: 'test-poisson',
      nom: 'Poisson test',
      ingredient_principal: 'poisson',
      ingredients: [
        { ingredient_id: 'saumon-frais', quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
        { ingredient_id: 'tomate', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const result = computeDietaryMetadata(recette, ingredientsMap);
    expect(result.exclusions_compatibles).not.toContain('sans-poisson');
    expect(result.exclusions_compatibles).toContain('sans-porc');
  });

  it('doit retourner exclusions_compatibles incluant vegetarien pour une recette tofu', () => {
    const recette: RecetteSansCalculs = {
      ...BASE,
      id: 'test-tofu',
      nom: 'Tofu sauté test',
      ingredient_principal: 'tofu',
      ingredients: [
        { ingredient_id: 'tomate', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
        { ingredient_id: 'carotte', quantite_base: 150, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const result = computeDietaryMetadata(recette, ingredientsMap);
    expect(result.exclusions_compatibles).toContain('vegetarien');
  });

  it('vegan implique vegetarien : toute recette vegan est aussi vegetarienne', () => {
    const result = computeDietaryMetadata(SALADE_VEGAN, ingredientsMap);
    if (result.exclusions_compatibles.includes('vegan')) {
      expect(result.exclusions_compatibles).toContain('vegetarien');
    }
  });

  it('ingredient_principal non-carné mais ingrédient viandes-poissons non-optionnel → pas végétarien', () => {
    // Cas "trace" : quiche-lorraine a ingredient_principal=oeufs mais contient des lardons
    const recette: RecetteSansCalculs = {
      ...BASE,
      id: 'test-quiche-trace',
      nom: 'Quiche trace test',
      ingredient_principal: 'oeufs',
      ingredients: [
        { ingredient_id: 'oeuf-entier', quantite_base: 3,   unite: 'piece', optionnel: false, groupe: undefined },
        { ingredient_id: 'saumon-frais', quantite_base: 200, unite: 'g',   optionnel: false, groupe: undefined },
      ],
    };
    const result = computeDietaryMetadata(recette, ingredientsMap);
    expect(result.exclusions_compatibles).not.toContain('vegetarien');
    expect(result.exclusions_compatibles).not.toContain('vegan');
  });

});
