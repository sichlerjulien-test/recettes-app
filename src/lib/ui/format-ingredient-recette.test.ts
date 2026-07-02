import { describe, it, expect } from 'vitest';
import { formatIngredientRecette } from './format-ingredient-recette';
import type { Ingredient, RecipeIngredient } from '../types/domain';

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'test-ingredient',
    nom_singulier: 'Oignon',
    nom_pluriel: 'Oignons',
    categorie: 'fruits-legumes',
    unite_base: 'piece',
    unite_achat: 'piece',
    conversion: 100,
    allergenes: [],
    contient_trace: [],
    substituts: [],
    exclusion_tags: [],
    ...overrides,
  };
}

function makeRI(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    ingredient_id: 'oignon',
    quantite_base: 2,
    unite: 'piece',
    optionnel: false,
    ...overrides,
  };
}

describe('formatIngredientRecette', () => {
  describe('discret — piece', () => {
    it('pluriel quand quantité > 1', () => {
      const ri = makeRI({ quantite_base: 3, unite: 'piece' });
      const ing = makeIngredient({ nom_singulier: 'Oignon', nom_pluriel: 'Oignons' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('3 Oignons');
    });

    it('singulier quand quantité = 1', () => {
      const ri = makeRI({ quantite_base: 1, unite: 'piece' });
      const ing = makeIngredient({ nom_singulier: 'Chou-fleur', nom_pluriel: 'Choux-fleurs' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('1 Chou-fleur');
    });
  });

  describe('discret — botte / sachet', () => {
    it('botte singulier', () => {
      const ri = makeRI({ quantite_base: 1, unite: 'botte' });
      const ing = makeIngredient({ nom_singulier: 'Persil plat', nom_pluriel: 'Persil plat', unite_achat: 'botte' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('1 Persil plat');
    });

    it('sachet pluriel', () => {
      const ri = makeRI({ quantite_base: 2, unite: 'sachet' });
      const ing = makeIngredient({ nom_singulier: 'Levure chimique', nom_pluriel: 'Levures chimiques', unite_achat: 'sachet' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('2 Levures chimiques');
    });
  });

  describe('continu', () => {
    it('grammes', () => {
      const ri = makeRI({ quantite_base: 200, unite: 'g' });
      const ing = makeIngredient({ nom_singulier: 'Pâtes', nom_pluriel: 'Pâtes' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('200g de Pâtes');
    });

    it('cuillere-soupe — anti-piège : jamais converti en litres ni arrondi par palier', () => {
      const ri = makeRI({ quantite_base: 2, unite: 'cuillere-soupe' });
      const ing = makeIngredient({ nom_singulier: "Huile d'olive", nom_pluriel: "Huile d'olive" });
      const result = formatIngredientRecette(ri, ing, 4, 4);
      expect(result).toBe("2c. à soupe de Huile d'olive");
      expect(result).not.toContain(' ml ');
      expect(result).not.toMatch(/^\d+ l de /);
    });

    it('cuillere-cafe', () => {
      const ri = makeRI({ quantite_base: 1, unite: 'cuillere-cafe' });
      const ing = makeIngredient({ nom_singulier: 'Cumin moulu', nom_pluriel: 'Cumin moulu' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('1c. à café de Cumin moulu');
    });

    it('millilitres', () => {
      const ri = makeRI({ quantite_base: 150, unite: 'ml' });
      const ing = makeIngredient({ nom_singulier: 'Lait', nom_pluriel: 'Lait' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('150ml de Lait');
    });

    it('litres', () => {
      const ri = makeRI({ quantite_base: 1, unite: 'l' });
      const ing = makeIngredient({ nom_singulier: 'Bouillon', nom_pluriel: 'Bouillon' });
      expect(formatIngredientRecette(ri, ing, 4, 4)).toBe('1l de Bouillon');
    });
  });

  describe('scaling', () => {
    it('base 800g, portions_base 4, entry.portions 6 → 1200g', () => {
      const ri = makeRI({ quantite_base: 800, unite: 'g' });
      const ing = makeIngredient({ nom_singulier: 'Bœuf haché', nom_pluriel: 'Bœuf haché' });
      expect(formatIngredientRecette(ri, ing, 6, 4)).toBe('1200g de Bœuf haché');
    });

    it('discret — arrondi au plus proche (4,5 → 5 pièces)', () => {
      const ri = makeRI({ quantite_base: 3, unite: 'piece' });
      const ing = makeIngredient({ nom_singulier: 'Œuf', nom_pluriel: 'Œufs' });
      // 3 * (6/4) = 4.5 → Math.round → 5
      expect(formatIngredientRecette(ri, ing, 6, 4)).toBe('5 Œufs');
    });

    it('continu — arrondi au plus proche (120.5 → 121)', () => {
      const ri = makeRI({ quantite_base: 241, unite: 'ml' });
      const ing = makeIngredient({ nom_singulier: 'Crème fraîche', nom_pluriel: 'Crème fraîche' });
      // 241 * (5/10) = 120.5 → Math.round → 121
      expect(formatIngredientRecette(ri, ing, 5, 10)).toBe('121ml de Crème fraîche');
    });

    it('discret — scaling non entier arrondi (3 * 4/6 = 2)', () => {
      const ri = makeRI({ quantite_base: 3, unite: 'piece' });
      const ing = makeIngredient({ nom_singulier: 'Oignon', nom_pluriel: 'Oignons' });
      // 3 * (4/6) = 2 → pluriel
      expect(formatIngredientRecette(ri, ing, 4, 6)).toBe('2 Oignons');
    });
  });

  describe('fallback ingrédient absent', () => {
    it('affiche quantité + slug sans planter', () => {
      const ri = makeRI({ ingredient_id: 'ingredient-inconnu', quantite_base: 2, unite: 'piece' });
      const result = formatIngredientRecette(ri, undefined, 4, 4);
      expect(result).toBe('2 ingredient-inconnu');
      expect(result).not.toContain('undefined');
    });
  });
});
