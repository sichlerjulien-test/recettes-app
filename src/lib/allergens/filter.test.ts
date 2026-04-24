import { describe, expect, it } from 'vitest';
import type { Recette } from '@/lib/types/domain';
import { allRecettes, getRecette, recettesMap } from '../../../tests/fixtures/recettes';
import { filterRecipes } from './filter';
import type { FilterConstraints } from './filter';

const ALL_EQUIPMENT: FilterConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

const NO_CONSTRAINTS: FilterConstraints = {
  allergenes_groupe: [],
  regimes_groupe: [],
  equipement_disponible: ALL_EQUIPMENT,
};

describe('filterRecipes', () => {

  it("doit retourner toutes les recettes quand le groupe n'a aucune contrainte", () => {
    const result = filterRecipes(allRecettes(), NO_CONSTRAINTS);
    expect(result).toHaveLength(allRecettes().length);
  });

  it('doit exclure exactement les recettes contenant gluten quand allergie=gluten', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten'],
    });
    for (const r of result) {
      expect(r.allergenes_calcules).not.toContain('gluten');
    }
    // salade-tomate-basilic et riz-saute-legumes (sans gluten) doivent etre presentes
    expect(result.some((r) => r.id === 'salade-tomate-basilic')).toBe(true);
    expect(result.some((r) => r.id === 'pates-bolognaise')).toBe(false);
  });

  it('doit exclure les recettes contenant gluten OU lait quand deux allergenes declares', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten', 'lait'],
    });
    for (const r of result) {
      expect(r.allergenes_calcules).not.toContain('gluten');
      expect(r.allergenes_calcules).not.toContain('lait');
    }
  });

  it('doit retourner uniquement les recettes vegan quand regime=vegan', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      regimes_groupe: ['vegan'],
    });
    for (const r of result) {
      expect(r.est_vegan).toBe(true);
    }
    expect(result.length).toBeGreaterThan(0);
  });

  it('doit retourner les recettes vegetariennes ET vegan quand regime=vegetarien', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      regimes_groupe: ['vegetarien'],
    });
    for (const r of result) {
      expect(r.est_vegetarien).toBe(true);
    }
    // Les recettes vegan doivent aussi passer (elles sont vegetariennes)
    expect(result.some((r) => r.est_vegan)).toBe(true);
    // Les recettes carnees doivent etre exclues
    expect(result.some((r) => r.id === 'pates-bolognaise')).toBe(false);
  });

  it('doit retourner uniquement les recettes vegan sans gluten quand vegan + allergie gluten', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten'],
      regimes_groupe: ['vegan'],
    });
    for (const r of result) {
      expect(r.est_vegan).toBe(true);
      expect(r.allergenes_calcules).not.toContain('gluten');
    }
  });

  it("doit exclure une recette necessitant four quand four n'est pas disponible", () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      equipement_disponible: ['plaque'],
    });
    expect(result.some((r) => r.id === 'quiche-lorraine')).toBe(false);
    expect(result.some((r) => r.id === 'souffle-fromage')).toBe(false);
  });

  it('doit inclure une recette necessitant plaque quand plaque est disponible', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      equipement_disponible: ['plaque'],
    });
    expect(result.some((r) => r.id === 'pates-bolognaise')).toBe(true);
  });

  it('doit exclure les recettes sans midi dans type_repas quand type_repas_requis=midi', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      type_repas_requis: 'midi',
    });
    for (const r of result) {
      expect(r.type_repas).toContain('midi');
    }
    expect(result.some((r) => r.id === 'raclette-soir')).toBe(false);
    expect(result.some((r) => r.id === 'tajine-agneau-soir')).toBe(false);
  });

  it('doit ne pas filtrer sur le type de repas quand type_repas_requis est absent', () => {
    const result = filterRecipes(allRecettes(), NO_CONSTRAINTS);
    // Des recettes midi-only et soir-only doivent coexister dans le resultat
    expect(result.some((r) => r.type_repas.includes('midi') && !r.type_repas.includes('soir'))).toBe(true);
    expect(result.some((r) => r.type_repas.includes('soir') && !r.type_repas.includes('midi'))).toBe(true);
  });

  it('doit retourner un tableau vide quand le catalogue est vide', () => {
    const result = filterRecipes([], NO_CONSTRAINTS);
    expect(result).toStrictEqual([]);
  });

  it('doit retourner un tableau vide quand aucune recette ne passe le filtre', () => {
    // Aucun equipement disponible -> toutes les recettes sont exclues
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      equipement_disponible: [],
    });
    expect(result).toStrictEqual([]);
  });

  it("doit ne pas muter le tableau d'entree (Object.freeze)", () => {
    const catalogue: readonly Recette[] = Object.freeze([...allRecettes()]) as Recette[];
    expect(() => filterRecipes(catalogue, NO_CONSTRAINTS)).not.toThrow();
    expect(catalogue).toHaveLength(allRecettes().length);
  });

  it('doit retourner un nouveau tableau meme quand toutes les recettes passent', () => {
    const input = allRecettes();
    const result = filterRecipes(input, NO_CONSTRAINTS);
    expect(result).not.toBe(input);
  });

  it('doit exclure les recettes contenant lait ou oeufs pour un groupe allergique aux deux', () => {
    const result = filterRecipes(allRecettes(), {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['lait', 'oeufs'],
    });
    for (const r of result) {
      expect(r.allergenes_calcules).not.toContain('lait');
      expect(r.allergenes_calcules).not.toContain('oeufs');
    }
    // Le catalogue doit contenir au moins quelques recettes sans lait ni oeufs
    expect(result.length).toBeGreaterThan(0);
  });

  it("doit respecter l'intersection stricte vegan + coeliaque + sans four + midi", () => {
    const result = filterRecipes(allRecettes(), {
      allergenes_groupe: ['gluten'],
      regimes_groupe: ['vegan'],
      equipement_disponible: ['plaque'],
      type_repas_requis: 'midi',
    });
    for (const r of result) {
      expect(r.est_vegan).toBe(true);
      expect(r.allergenes_calcules).not.toContain('gluten');
      expect(r.equipement.every((e) => e === 'plaque')).toBe(true);
      expect(r.type_repas).toContain('midi');
    }
    // salade-midi et soupe-legumes-midi sont vegan, sans gluten, plaque, midi
    expect(result.some((r) => r.id === 'salade-midi')).toBe(true);
    expect(result.some((r) => r.id === 'soupe-legumes-midi')).toBe(true);
    // tajine-agneau-soir est soir-only -> exclu
    expect(result.some((r) => r.id === 'tajine-agneau-soir')).toBe(false);
  });

});
