import { describe, expect, it } from 'vitest';
import type { Recette } from '../types/domain';
import { allRecettes } from '../../../tests/fixtures/recettes';
import { filterRecipes } from './filter';
import type { FilterConstraints } from './filter';

const ALL_EQUIPMENT: FilterConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

const NO_CONSTRAINTS: FilterConstraints = {
  allergenes_groupe: [],
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
    expect(result.some((r) => r.id === 'tajine-boeuf-soir')).toBe(false);
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

});
