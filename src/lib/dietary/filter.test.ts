import { describe, expect, it } from 'vitest';
import { allRecettes } from '../../../tests/fixtures/recettes';
import { filterRecipes } from '../allergens/filter';
import { filterByExclusions } from './filter';
import type { ExclusionConstraints } from './filter';

const NO_EXCLUSIONS: ExclusionConstraints = { exclusions_groupe: [] };

describe('filterByExclusions', () => {

  it('doit retourner toutes les recettes quand aucune exclusion déclarée', () => {
    const all = allRecettes();
    const result = filterByExclusions(all, NO_EXCLUSIONS);
    expect(result).toHaveLength(all.length);
  });

  it('doit retourner uniquement les recettes vegan quand exclusion=vegan', () => {
    const result = filterByExclusions(allRecettes(), { exclusions_groupe: ['vegan'] });
    for (const r of result) {
      expect(r.exclusions_compatibles).toContain('vegan');
    }
    expect(result.length).toBeGreaterThan(0);
  });

  it('doit retourner les recettes vegetariennes ET vegan quand exclusion=vegetarien', () => {
    const result = filterByExclusions(allRecettes(), { exclusions_groupe: ['vegetarien'] });
    for (const r of result) {
      expect(r.exclusions_compatibles).toContain('vegetarien');
    }
    // Les recettes vegan doivent aussi passer (elles sont vegetariennes)
    expect(result.some((r) => r.exclusions_compatibles.includes('vegan'))).toBe(true);
    // Les recettes carnées doivent être exclues
    expect(result.some((r) => r.id === 'pates-bolognaise')).toBe(false);
  });

  it('doit retourner un tableau vide quand aucune recette ne passe le filtre vegan', () => {
    const nonVegan = allRecettes().filter((r) => !r.exclusions_compatibles.includes('vegan'));
    const result = filterByExclusions(nonVegan, { exclusions_groupe: ['vegan'] });
    expect(result).toStrictEqual([]);
  });

  it('doit retourner un nouveau tableau même quand aucune exclusion déclarée', () => {
    const input = allRecettes();
    const result = filterByExclusions(input, NO_EXCLUSIONS);
    expect(result).not.toBe(input);
  });

  it('doit ne pas muter le tableau d\'entrée (Object.freeze)', () => {
    const frozen = Object.freeze([...allRecettes()]);
    expect(() => filterByExclusions(frozen, { exclusions_groupe: ['vegan'] })).not.toThrow();
  });

  it('chaîne filterRecipes → filterByExclusions : recettes vegan sans gluten uniquement', () => {
    const allergenPool = filterRecipes(allRecettes(), { allergenes_groupe: ['gluten'], equipement_disponible: ['plaque', 'four', 'micro-ondes', 'barbecue', 'blender', 'robot'] });
    const result = filterByExclusions(allergenPool, { exclusions_groupe: ['vegan'] });
    for (const r of result) {
      expect(r.exclusions_compatibles).toContain('vegan');
      expect(r.allergenes_calcules).not.toContain('gluten');
    }
    expect(result.length).toBeGreaterThan(0);
  });

  // ── Intensif : 100 tirages aléatoires — jamais de non-vegan après filtre vegan ──────────────

  it('intensif : 100 tirages — filtre vegan ne laisse jamais passer une recette non-vegan', () => {
    const catalogue = allRecettes();
    for (let i = 0; i < 100; i++) {
      const pool = filterByExclusions(catalogue, { exclusions_groupe: ['vegan'] });
      for (const r of pool) {
        expect(r.exclusions_compatibles).toContain('vegan');
      }
    }
  });

  it('intensif : 100 tirages — filtre vegetarien ne laisse jamais passer une recette carnée', () => {
    const catalogue = allRecettes();
    for (let i = 0; i < 100; i++) {
      const pool = filterByExclusions(catalogue, { exclusions_groupe: ['vegetarien'] });
      for (const r of pool) {
        expect(r.exclusions_compatibles).toContain('vegetarien');
      }
    }
  });

});
