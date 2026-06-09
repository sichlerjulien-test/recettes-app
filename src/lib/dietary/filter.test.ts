import { describe, expect, it } from 'vitest';
import { allRecettes } from '../../../tests/fixtures/recettes';
import { filterRecipes } from '../allergens/filter';
import { filterByDietary } from './filter';
import type { DietaryConstraints } from './filter';

const NO_DIETARY: DietaryConstraints = { regimes_groupe: [] };

describe('filterByDietary', () => {

  it('doit retourner toutes les recettes quand aucun régime déclaré', () => {
    const all = allRecettes();
    const result = filterByDietary(all, NO_DIETARY);
    expect(result).toHaveLength(all.length);
  });

  it('doit retourner uniquement les recettes vegan quand regime=vegan', () => {
    const result = filterByDietary(allRecettes(), { regimes_groupe: ['vegan'] });
    for (const r of result) {
      expect(r.est_vegan).toBe(true);
    }
    expect(result.length).toBeGreaterThan(0);
  });

  it('doit retourner les recettes vegetariennes ET vegan quand regime=vegetarien', () => {
    const result = filterByDietary(allRecettes(), { regimes_groupe: ['vegetarien'] });
    for (const r of result) {
      expect(r.est_vegetarien).toBe(true);
    }
    // Les recettes vegan doivent aussi passer (elles sont vegetariennes)
    expect(result.some((r) => r.est_vegan)).toBe(true);
    // Les recettes carnées doivent être exclues
    expect(result.some((r) => r.id === 'pates-bolognaise')).toBe(false);
  });

  it('doit retourner un tableau vide quand aucune recette ne passe le filtre vegan', () => {
    // Toutes les recettes non-vegan → résultat vide si le catalogue n'a que des non-vegan
    const nonVegan = allRecettes().filter((r) => !r.est_vegan);
    const result = filterByDietary(nonVegan, { regimes_groupe: ['vegan'] });
    expect(result).toStrictEqual([]);
  });

  it('doit retourner un nouveau tableau même quand aucun régime déclaré', () => {
    const input = allRecettes();
    const result = filterByDietary(input, NO_DIETARY);
    expect(result).not.toBe(input);
  });

  it('doit ne pas muter le tableau d\'entrée (Object.freeze)', () => {
    const frozen = Object.freeze([...allRecettes()]);
    expect(() => filterByDietary(frozen, { regimes_groupe: ['vegan'] })).not.toThrow();
  });

  it('chaîne filterRecipes → filterByDietary : recettes vegan sans gluten uniquement', () => {
    // Simule la chaîne complète du pipeline pour un profil vegan+coeliaque
    const allergenPool = filterRecipes(allRecettes(), { allergenes_groupe: ['gluten'], equipement_disponible: ['plaque', 'four', 'micro-ondes', 'barbecue', 'blender', 'robot'] });
    const result = filterByDietary(allergenPool, { regimes_groupe: ['vegan'] });
    for (const r of result) {
      expect(r.est_vegan).toBe(true);
      expect(r.allergenes_calcules).not.toContain('gluten');
    }
    expect(result.length).toBeGreaterThan(0);
  });

});
