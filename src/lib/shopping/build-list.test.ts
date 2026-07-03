import { describe, expect, it } from 'vitest';
import { buildShoppingList } from './build-list';
import { recettesMap } from '../../../tests/fixtures/recettes';
import { ingredientsMap } from '../../../tests/fixtures/ingredients';
import type { Planning, Recette, Ingredient, MealType, ExclusionTag } from '../types/domain';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePlanning(
  entries: Array<{ kind: 'recette'; jour: number; repas: MealType; recette_id: string }>,
): Planning {
  return {
    id: 'test-planning',
    sejour_id: 'test-sejour',
    entries: entries.map((e) => ({ ...e, portions: 4 })),
    genere_le: '2026-04-27T12:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
  };
}

// Champs communs pour construire une Recette minimale dans les tests locaux
const BASE_RECETTE = {
  nom: 'Recette test',
  description: '',
  portions_base: 4,
  duree_minutes: 20,
  duree_active: 10,
  difficulte: 'facile' as const,
  equipement: ['plaque' as const],
  type_repas: ['midi' as const],
  type_cuisine: 'neutre' as const,
  saison: ['toutes' as const],
  ingredient_principal: 'legumes' as const,
  feculent_dominant: 'aucun' as const,
  etapes: ['Cuire.'],
  tags_libres: [],
  allergenes_calcules: [],
  exclusions_compatibles: ['vegetarien', 'vegan'] as ExclusionTag[],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildShoppingList', () => {

  // === Cas nominal — agrégation simple ===

  it('should return ok with empty categories when planning has no entries', () => {
    const planning = makePlanning([]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cats = Object.keys(result.items_par_categorie);
    expect(cats).toHaveLength(11);
    for (const items of Object.values(result.items_par_categorie)) {
      expect(items).toHaveLength(0);
    }
  });

  it('should aggregate quantities for the same ingredient and unit across multiple recipes', () => {
    // pates-bolognaise : tomate 400g — salade-tomate-basilic : tomate 600g
    // portions_base=4, nbParticipants=4 → facteur=1
    // total tomate : ceil(400)+ceil(600) = 1000g → 1000/1000 = 1 kg
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tomate = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'tomate');
    expect(tomate).toBeDefined();
    expect(tomate?.quantite_totale).toBe(1);
    expect(tomate?.unite_affichee).toBe('kg');
  });

  it('should keep separate items when same ingredient is used with different units', () => {
    // Fixture locale : un ingrédient (unite_base='ml') utilisé en 'ml' dans une recette
    // et en 'cuillere-soupe' dans une autre → deux items distincts dans la liste
    const ingredientLocal: Ingredient = {
      id: 'sauce-locale',
      nom_singulier: 'Sauce locale',
      nom_pluriel: 'Sauces locales',
      categorie: 'condiments-epices',
      unite_base: 'ml',
      unite_achat: 'l',
      conversion: 1000,
      allergenes: [],
      contient_trace: [],
      substituts: [],
      exclusion_tags: [],
    };
    const recetteA: Recette = {
      ...BASE_RECETTE,
      id: 'recette-sauce-ml',
      ingredients: [
        { ingredient_id: 'sauce-locale', quantite_base: 100, unite: 'ml', optionnel: false, groupe: undefined },
      ],
    };
    const recetteB: Recette = {
      ...BASE_RECETTE,
      id: 'recette-sauce-cuillere',
      ingredients: [
        { ingredient_id: 'sauce-locale', quantite_base: 2, unite: 'cuillere-soupe', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([
      ['recette-sauce-ml', recetteA],
      ['recette-sauce-cuillere', recetteB],
    ]);
    const localIngredients = new Map<string, Ingredient>([['sauce-locale', ingredientLocal]]);
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-sauce-ml' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-sauce-cuillere' },
    ]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sauceItems = result.items_par_categorie['condiments-epices']
      .filter((i) => i.ingredient_id === 'sauce-locale');
    expect(sauceItems).toHaveLength(2);
  });

  it('should multiply quantities by nbParticipants divided by portions_base', () => {
    // omelette-legumes : portions_base=2, oeuf-entier 4 piece
    // nbParticipants=6 → facteur=3 → ceil(4*3)=12 pieces
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'omelette-legumes' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const oeufs = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'oeuf-entier');
    expect(oeufs?.quantite_totale).toBe(12);
    expect(oeufs?.unite_affichee).toBe('piece');
  });

  it('should round up quantities with Math.ceil to avoid shortage', () => {
    // quiche-lorraine : portions_base=6, oeuf-entier 4 piece
    // nbParticipants=4 → facteur=4/6 → ceil(4 * 4/6) = ceil(2.67) = 3 (pas 2)
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'quiche-lorraine' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const oeufs = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'oeuf-entier');
    expect(oeufs?.quantite_totale).toBe(3);
  });

  it('should round displayed quantities to 2 decimal places max', () => {
    // quiche-lorraine : portions_base=6, lait-entier 200ml
    // nbParticipants=4 → ceil(200 * 4/6) = ceil(133.33) = 134ml → 134/1000 = 0.134 → round2 = 0.13
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'quiche-lorraine' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lait = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'lait-entier');
    expect(lait?.quantite_totale).toBe(0.13);
    expect(String(lait?.quantite_totale).replace('.', '').length).toBeLessThanOrEqual(4);
  });

  // === Cas optionnel ===

  it('should mark item as optional when ingredient is optional in all recipes', () => {
    // carbonara-sans-parmesan : parmesan optionnel=true
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'carbonara-sans-parmesan' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parmesan = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'parmesan');
    expect(parmesan?.optionnel).toBe(true);
  });

  it('should mark item as non-optional when ingredient is non-optional in at least one recipe', () => {
    // carbonara-classique : parmesan optionnel=false
    // carbonara-sans-parmesan : parmesan optionnel=true
    // → la version non-optionnelle l'emporte
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'carbonara-classique' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'carbonara-sans-parmesan' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parmesan = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'parmesan');
    expect(parmesan?.optionnel).toBe(false);
  });

  it('should include optional ingredients in the list and not exclude them', () => {
    // curry-poulet-sans-cacahuetes : cacahuetes optionnel=true → présent dans la liste
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'curry-poulet-sans-cacahuetes' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cacahuetes = result.items_par_categorie['epicerie-salee']
      .find((i) => i.ingredient_id === 'cacahuetes');
    expect(cacahuetes).toBeDefined();
    expect(cacahuetes?.optionnel).toBe(true);
  });

  // === Catégorisation ===

  it('should group items by ingredient category', () => {
    // pad-thai : crevettes (viandes-poissons), cacahuetes (epicerie-salee),
    //            sauce-soja (condiments-epices), riz-basmati (feculents-pates-riz)
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'pad-thai' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { items_par_categorie } = result;
    expect(items_par_categorie['viandes-poissons'].some((i) => i.ingredient_id === 'crevettes')).toBe(true);
    expect(items_par_categorie['epicerie-salee'].some((i) => i.ingredient_id === 'cacahuetes')).toBe(true);
    expect(items_par_categorie['condiments-epices'].some((i) => i.ingredient_id === 'sauce-soja')).toBe(true);
    expect(items_par_categorie['feculents-pates-riz'].some((i) => i.ingredient_id === 'riz-basmati')).toBe(true);
  });

  it('should include all 11 categories in the output even when empty', () => {
    // salade-tomate-basilic n'utilise que des fruits-légumes
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.items_par_categorie)).toHaveLength(11);
    expect(result.items_par_categorie['viandes-poissons']).toHaveLength(0);
    expect(result.items_par_categorie['surgele']).toHaveLength(0);
    expect(result.items_par_categorie['boissons']).toHaveLength(0);
    expect(result.items_par_categorie['epicerie-sucree']).toHaveLength(0);
  });

  it('should sort items alphabetically by nom_affiche within each category', () => {
    // salade-tomate-basilic → fruits-legumes : Tomate, Oignon, Carotte
    // ordre attendu après tri : Carotte < Oignon < Tomate
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = result.items_par_categorie['fruits-legumes'];
    expect(items).toHaveLength(3);
    const [first, second, third] = items;
    expect(first?.nom_affiche).toBe('Carotte');
    expect(second?.nom_affiche).toBe('Oignon');
    expect(third?.nom_affiche).toBe('Tomate');
  });

  // === utilise_dans ===

  it('should populate utilise_dans with deduplicated recette_id list', () => {
    // tomate utilisée dans pates-bolognaise ET salade-tomate-basilic
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tomate = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'tomate');
    expect(tomate?.utilise_dans).toContain('pates-bolognaise');
    expect(tomate?.utilise_dans).toContain('salade-tomate-basilic');
    // déduplication : chaque recette_id apparaît une seule fois
    const unique = new Set(tomate?.utilise_dans);
    expect(unique.size).toBe(tomate?.utilise_dans.length);
  });

  // === Conversion d'unités ===

  it('should convert from unite_base to unite_achat when units match', () => {
    // gratin-dauphinois : lait-entier 400ml (unite_base='ml', unite_achat='l', conversion=1000)
    // portions_base=4, nbParticipants=4 → facteur=1 → 400ml / 1000 = 0.4 l
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'gratin-dauphinois' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lait = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'lait-entier');
    expect(lait?.quantite_totale).toBe(0.4);
    expect(lait?.unite_affichee).toBe('l');
  });

  it('should not convert when ingredient unit does not match unite_base', () => {
    // Fixture locale : ingrédient (unite_base='ml') utilisé en 'cuillere-soupe'
    // 'cuillere-soupe' ≠ 'ml' → pas de conversion, unite_affichee = 'cuillere-soupe'
    const ingredient: Ingredient = {
      id: 'huile-locale',
      nom_singulier: "Huile d'olive",
      nom_pluriel: "Huiles d'olive",
      categorie: 'condiments-epices',
      unite_base: 'ml',
      unite_achat: 'l',
      conversion: 1000,
      allergenes: [],
      contient_trace: [],
      substituts: [],
      exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-huile-cuillere',
      ingredients: [
        { ingredient_id: 'huile-locale', quantite_base: 3, unite: 'cuillere-soupe', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([['recette-huile-cuillere', recette]]);
    const localIngredients = new Map<string, Ingredient>([['huile-locale', ingredient]]);
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-huile-cuillere' },
    ]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const huile = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'huile-locale');
    expect(huile?.quantite_totale).toBe(3);
    expect(huile?.unite_affichee).toBe('cuillere-soupe');
  });

  it('should ceil discrete unit once after conversion (chou-fleur 240g → 1 piece)', () => {
    // unite_base=g, unite_achat=piece, conversion=800
    // 240g / 800 = 0.3 → ceil = 1
    const ingredient: Ingredient = {
      id: 'chou-fleur',
      nom_singulier: 'Chou-fleur',
      nom_pluriel: 'Choux-fleurs',
      categorie: 'fruits-legumes',
      unite_base: 'g',
      unite_achat: 'piece',
      conversion: 800,
      allergenes: [],
      contient_trace: [],
      substituts: [],
      exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-chou',
      portions_base: 4,
      ingredients: [
        { ingredient_id: 'chou-fleur', quantite_base: 240, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([['recette-chou', recette]]);
    const localIngredients = new Map<string, Ingredient>([['chou-fleur', ingredient]]);
    const planning = makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-chou' }]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chou = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'chou-fleur');
    expect(chou?.quantite_totale).toBe(1);
    expect(chou?.unite_affichee).toBe('piece');
  });

  it('should ceil sum of raws, not sum of ceils (anti-bias: 240g+240g → 1 piece, not 2)', () => {
    // deux entries de 240g → somme brute 480g → 480/800 = 0.6 → ceil = 1
    // si on arrondissait avant : ceil(240/800)+ceil(240/800) = 1+1 = 2 (faux)
    const ingredient: Ingredient = {
      id: 'chou-fleur-b',
      nom_singulier: 'Chou-fleur',
      nom_pluriel: 'Choux-fleurs',
      categorie: 'fruits-legumes',
      unite_base: 'g',
      unite_achat: 'piece',
      conversion: 800,
      allergenes: [],
      contient_trace: [],
      substituts: [],
      exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-chou-2',
      portions_base: 4,
      ingredients: [
        { ingredient_id: 'chou-fleur-b', quantite_base: 240, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([['recette-chou-2', recette]]);
    const localIngredients = new Map<string, Ingredient>([['chou-fleur-b', ingredient]]);
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-chou-2' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-chou-2' },
    ]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chou = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'chou-fleur-b');
    expect(chou?.quantite_totale).toBe(1);
    expect(chou?.unite_affichee).toBe('piece');
  });

  // === Pluralisation et suppression du mot «pièce» ===

  it('should use nom_pluriel for nom_affiche when quantite_totale > 1 (discrete piece)', () => {
    // omelette-legumes : portions_base=2, oeuf-entier=4 piece
    // nbParticipants=6 → facteur=3 → 4*3=12 → quantite_totale=12 > 1 → nom_pluriel
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'omelette-legumes' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const oeufs = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'oeuf-entier');
    expect(oeufs?.quantite_totale).toBe(12);
    expect(oeufs?.unite_affichee).toBe('piece');
    expect(oeufs?.nom_affiche).toBe('Œufs entiers');
  });

  it('should use nom_singulier for nom_affiche when quantite_totale <= 1 (discrete piece)', () => {
    // Fixture locale : 1 seule pièce → quantite_totale = 1, NOT > 1 → nom_singulier
    const ingredient: Ingredient = {
      id: 'oeuf-test-singulier',
      nom_singulier: 'Œuf test',
      nom_pluriel: 'Œufs test',
      categorie: 'cremerie-oeufs',
      unite_base: 'piece',
      unite_achat: 'piece',
      conversion: 1,
      allergenes: [],
      contient_trace: [],
      substituts: [],
      exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-oeuf-singulier',
      portions_base: 4,
      ingredients: [
        { ingredient_id: 'oeuf-test-singulier', quantite_base: 1, unite: 'piece', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([['recette-oeuf-singulier', recette]]);
    const localIngredients = new Map<string, Ingredient>([['oeuf-test-singulier', ingredient]]);
    const planning = makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-oeuf-singulier' }]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const oeuf = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'oeuf-test-singulier');
    expect(oeuf?.quantite_totale).toBe(1);
    expect(oeuf?.unite_affichee).toBe('piece');
    expect(oeuf?.nom_affiche).toBe('Œuf test');
  });

  it('should use nom_singulier for continuous kg regardless of qty (tomate, qty = 2 kg > 1)', () => {
    // pates-bolognaise: tomate 400g + salade-tomate-basilic: tomate 600g
    // portions_base=4, nbParticipants=8 → facteur=2
    // total brut = (400+600)*2 = 2000g → round2(2000/1000) = 2 kg
    // 2 kg > 1 MAIS unite_affichee='kg' ∉ DISCRETE_UNITS → toujours nom_singulier
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tomate = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'tomate');
    expect(tomate?.quantite_totale).toBe(2);
    expect(tomate?.nom_affiche).toBe('Tomate');
  });

  // === Discriminants pluralisation (échouent si +s naïf) ===

  it('should use nom_pluriel for discrete piece ingredient — composé (chou-fleur → choux-fleurs)', () => {
    // Discriminant : +s naïf donnerait 'Chou-fleurs' ≠ 'Choux-fleurs' → le test échouerait
    const ingredient: Ingredient = {
      id: 'chou-fleur-d',
      nom_singulier: 'Chou-fleur',
      nom_pluriel: 'Choux-fleurs',
      categorie: 'fruits-legumes',
      unite_base: 'piece',
      unite_achat: 'piece',
      conversion: 1,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-chou-d',
      portions_base: 4,
      ingredients: [
        { ingredient_id: 'chou-fleur-d', quantite_base: 2, unite: 'piece', optionnel: false, groupe: undefined },
      ],
    };
    // facteur=1, ceil(2)=2 > 1 → nom_pluriel attendu
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-chou-d' }]),
      new Map([['recette-chou-d', recette]]),
      new Map([['chou-fleur-d', ingredient]]),
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const chou = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'chou-fleur-d');
    expect(chou?.quantite_totale).toBe(2);
    expect(chou?.unite_affichee).toBe('piece');
    expect(chou?.nom_affiche).toBe('Choux-fleurs');
  });

  it('should use nom_singulier for continuous ingredient regardless of qty — invariable (riz, qty = 1,2 kg > 1)', () => {
    // Discriminant #1 : +s naïf donnerait 'Riz basmatis' ≠ 'Riz basmati' → échouerait
    // Discriminant #2 : utiliser nom_pluriel pour les continus donnerait
    //   'Riz basmati (pluriel-test)' ≠ 'Riz basmati' → échouerait
    // unite_affichee='kg' ∉ DISCRETE_UNITS → toujours nom_singulier
    const ingredient: Ingredient = {
      id: 'riz-inv',
      nom_singulier: 'Riz basmati',
      nom_pluriel: 'Riz basmati (pluriel-test)', // délibérément distinct pour rendre le test discriminant
      categorie: 'feculents-pates-riz',
      unite_base: 'g',
      unite_achat: 'kg',
      conversion: 1000,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-riz-inv',
      portions_base: 4,
      ingredients: [
        { ingredient_id: 'riz-inv', quantite_base: 600, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    // nbParticipants=8 → facteur=2 → 600*2=1200g → round2(1200/1000)=1.2 kg > 1 → nom_singulier
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-riz-inv' }]),
      new Map([['recette-riz-inv', recette]]),
      new Map([['riz-inv', ingredient]]),
      8,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const riz = result.items_par_categorie['feculents-pates-riz']
      .find((i) => i.ingredient_id === 'riz-inv');
    expect(riz?.quantite_totale).toBe(1.2);
    expect(riz?.nom_affiche).toBe('Riz basmati');
  });

  // === Arrondi commercial poids (g) — échelle par palier vers le haut ===

  it('should apply scale-based rounding for g display: 187.5g → 200g (palier 50)', () => {
    // portions_base=4, quantite_base=150g, nbParticipants=5 → facteur=1.25
    // brut=150*1.25=187.5g → roundByScale: 50≤187.5≤500 → ceil(187.5/50)*50=4*50=200
    const ingredient: Ingredient = {
      id: 'epice-g',
      nom_singulier: 'Épice test', nom_pluriel: 'Épices test',
      categorie: 'condiments-epices', unite_base: 'g', unite_achat: 'g', conversion: 1,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE, id: 'recette-epice-g', portions_base: 4,
      ingredients: [{ ingredient_id: 'epice-g', quantite_base: 150, unite: 'g', optionnel: false, groupe: undefined }],
    };
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-epice-g' }]),
      new Map([['recette-epice-g', recette]]),
      new Map([['epice-g', ingredient]]),
      5,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'epice-g');
    expect(item?.quantite_totale).toBe(200);
    expect(item?.unite_affichee).toBe('g');
  });

  it('should apply scale-based rounding for g display: <50g → palier 10 (25g → 30g)', () => {
    // 25g < 50 → ceil(25/10)*10=3*10=30
    const ingredient: Ingredient = {
      id: 'epice-g-s', nom_singulier: 'Épice small', nom_pluriel: 'Épices small',
      categorie: 'condiments-epices', unite_base: 'g', unite_achat: 'g', conversion: 1,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE, id: 'recette-epice-g-s', portions_base: 4,
      ingredients: [{ ingredient_id: 'epice-g-s', quantite_base: 25, unite: 'g', optionnel: false, groupe: undefined }],
    };
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-epice-g-s' }]),
      new Map([['recette-epice-g-s', recette]]),
      new Map([['epice-g-s', ingredient]]),
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'epice-g-s');
    expect(item?.quantite_totale).toBe(30);
  });

  it('should apply scale-based rounding for g display: >500g → palier 100 (620g → 700g)', () => {
    // 620g > 500 → ceil(620/100)*100=7*100=700
    const ingredient: Ingredient = {
      id: 'epice-g-l', nom_singulier: 'Épice large', nom_pluriel: 'Épices large',
      categorie: 'condiments-epices', unite_base: 'g', unite_achat: 'g', conversion: 1,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE, id: 'recette-epice-g-l', portions_base: 4,
      ingredients: [{ ingredient_id: 'epice-g-l', quantite_base: 620, unite: 'g', optionnel: false, groupe: undefined }],
    };
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-epice-g-l' }]),
      new Map([['recette-epice-g-l', recette]]),
      new Map([['epice-g-l', ingredient]]),
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'epice-g-l');
    expect(item?.quantite_totale).toBe(700);
  });

  // === Arrondi volume (ml) et cuillères ===

  it('should apply scale-based rounding for ml display: 187.5ml → 200ml (palier 50)', () => {
    // unite_base='ml', unite_achat='ml', conversion=1
    // 150ml * facteur=1.25 → 187.5ml → roundByScale → 200ml
    const ingredient: Ingredient = {
      id: 'sauce-ml', nom_singulier: 'Sauce test', nom_pluriel: 'Sauces test',
      categorie: 'condiments-epices', unite_base: 'ml', unite_achat: 'ml', conversion: 1,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE, id: 'recette-sauce-ml-r', portions_base: 4,
      ingredients: [{ ingredient_id: 'sauce-ml', quantite_base: 150, unite: 'ml', optionnel: false, groupe: undefined }],
    };
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-sauce-ml-r' }]),
      new Map([['recette-sauce-ml-r', recette]]),
      new Map([['sauce-ml', ingredient]]),
      5,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'sauce-ml');
    expect(item?.quantite_totale).toBe(200);
    expect(item?.unite_affichee).toBe('ml');
  });

  it('should ceil cuillere-soupe to avoid fractional spoons (2.67 cuilleres → 3)', () => {
    // Recette: 4 cuillere-soupe pour 6 portions, nbParticipants=4 → facteur=4/6
    // brut=4*4/6=2.666... → ceil=3 (pas round2=2.67)
    const ingredient: Ingredient = {
      id: 'huile-cuil', nom_singulier: "Huile d'olive", nom_pluriel: "Huiles d'olive",
      categorie: 'condiments-epices', unite_base: 'ml', unite_achat: 'l', conversion: 1000,
      allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
    };
    const recette: Recette = {
      ...BASE_RECETTE, id: 'recette-cuil', portions_base: 6,
      ingredients: [{ ingredient_id: 'huile-cuil', quantite_base: 4, unite: 'cuillere-soupe', optionnel: false, groupe: undefined }],
    };
    const result = buildShoppingList(
      makePlanning([{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-cuil' }]),
      new Map([['recette-cuil', recette]]),
      new Map([['huile-cuil', ingredient]]),
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items_par_categorie['condiments-epices']
      .find((i) => i.ingredient_id === 'huile-cuil');
    expect(item?.quantite_totale).toBe(3);
    expect(item?.unite_affichee).toBe('cuillere-soupe');
  });

  // === Cas d'erreur ===

  it('should return error invalid_participants when nbParticipants is zero or negative', () => {
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
    ]);
    const resultZero = buildShoppingList(planning, recettesMap, ingredientsMap, 0);
    expect(resultZero.ok).toBe(false);
    if (resultZero.ok) return;
    expect(resultZero.error.kind).toBe('invalid_participants');

    const resultNeg = buildShoppingList(planning, recettesMap, ingredientsMap, -3);
    expect(resultNeg.ok).toBe(false);
    if (resultNeg.ok) return;
    if (resultNeg.error.kind === 'invalid_participants') {
      expect(resultNeg.error.nbParticipants).toBe(-3);
    }
  });

  it('should return error recette_inconnue when planning references unknown recette', () => {
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-inexistante-xyz' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('recette_inconnue');
    if (result.error.kind === 'recette_inconnue') {
      expect(result.error.recette_id).toBe('recette-inexistante-xyz');
    }
  });

  it('should return error ingredient_inconnu when recette references unknown ingredient', () => {
    const recette: Recette = {
      ...BASE_RECETTE,
      id: 'recette-ingredient-fantome',
      ingredients: [
        { ingredient_id: 'ingredient-fantome-xyz', quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      ],
    };
    const localRecettes = new Map<string, Recette>([['recette-ingredient-fantome', recette]]);
    const planning = makePlanning([
      { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'recette-ingredient-fantome' },
    ]);
    const result = buildShoppingList(planning, localRecettes, ingredientsMap, 4);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ingredient_inconnu');
    if (result.error.kind === 'ingredient_inconnu') {
      expect(result.error.ingredient_id).toBe('ingredient-fantome-xyz');
      expect(result.error.recette_id).toBe('recette-ingredient-fantome');
    }
  });

  // ── TK-42 : slots resto (ADR-022) ──────────────────────────────────────────

  it('CA-4 : planning avec un slot resto au soir — zéro ingrédient depuis ce slot', () => {
    const planning: Planning = {
      id: 'test-planning',
      sejour_id: 'test-sejour',
      entries: [
        { kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 },
        { kind: 'resto' as const, jour: 1, repas: 'soir' },
      ],
      genere_le: '2026-04-27T12:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Liste identique à un planning avec seulement salade-tomate-basilic au midi
    const planningMidiOnly = makePlanning([{ kind: 'recette', jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' }]);
    const resultMidiOnly = buildShoppingList(planningMidiOnly, recettesMap, ingredientsMap, 4);
    expect(resultMidiOnly.ok).toBe(true);
    if (!resultMidiOnly.ok) return;
    // Les deux listes doivent être identiques (le slot resto n'ajoute aucun ingrédient)
    expect(result.items_par_categorie).toEqual(resultMidiOnly.items_par_categorie);
  });

  it('CA-5 : séjour tout-resto → liste de courses vide, pas de crash', () => {
    const planning: Planning = {
      id: 'test-planning',
      sejour_id: 'test-sejour',
      entries: [
        { kind: 'resto' as const, jour: 1, repas: 'midi' },
        { kind: 'resto' as const, jour: 1, repas: 'soir' },
        { kind: 'resto' as const, jour: 2, repas: 'midi' },
        { kind: 'resto' as const, jour: 2, repas: 'soir' },
      ],
      genere_le: '2026-04-27T12:00:00Z',
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    };
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Toutes les catégories sont vides
    for (const items of Object.values(result.items_par_categorie)) {
      expect(items).toHaveLength(0);
    }
  });

});
