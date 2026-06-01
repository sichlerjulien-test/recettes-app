import { describe, expect, it } from 'vitest';
import { buildShoppingList } from './build-list';
import { recettesMap } from '../../../tests/fixtures/recettes';
import { ingredientsMap } from '../../../tests/fixtures/ingredients';
import type { Planning, Recette, Ingredient, MealType } from '../types/domain';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePlanning(
  entries: Array<{ jour: number; repas: MealType; recette_id: string }>,
): Planning {
  return {
    id: 'test-planning',
    sejour_id: 'test-sejour',
    entries: entries.map((e) => ({ ...e, portions: 4 })),
    genere_le: '2026-04-27T12:00:00Z',
    contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
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
  est_vegetarien: true,
  est_vegan: true,
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
      { jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
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
      { jour: 1, repas: 'midi', recette_id: 'recette-sauce-ml' },
      { jour: 1, repas: 'soir', recette_id: 'recette-sauce-cuillere' },
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
      { jour: 1, repas: 'midi', recette_id: 'omelette-legumes' },
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
      { jour: 1, repas: 'midi', recette_id: 'quiche-lorraine' },
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
      { jour: 1, repas: 'midi', recette_id: 'quiche-lorraine' },
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
      { jour: 1, repas: 'midi', recette_id: 'carbonara-sans-parmesan' },
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
      { jour: 1, repas: 'midi', recette_id: 'carbonara-classique' },
      { jour: 1, repas: 'soir', recette_id: 'carbonara-sans-parmesan' },
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
      { jour: 1, repas: 'midi', recette_id: 'curry-poulet-sans-cacahuetes' },
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
      { jour: 1, repas: 'midi', recette_id: 'pad-thai' },
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
      { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
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
      { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
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
      { jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
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
      { jour: 1, repas: 'midi', recette_id: 'gratin-dauphinois' },
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
      { jour: 1, repas: 'midi', recette_id: 'recette-huile-cuillere' },
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
    const planning = makePlanning([{ jour: 1, repas: 'midi', recette_id: 'recette-chou' }]);
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
      { jour: 1, repas: 'midi', recette_id: 'recette-chou-2' },
      { jour: 1, repas: 'soir', recette_id: 'recette-chou-2' },
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
      { jour: 1, repas: 'midi', recette_id: 'omelette-legumes' },
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
    const planning = makePlanning([{ jour: 1, repas: 'midi', recette_id: 'recette-oeuf-singulier' }]);
    const result = buildShoppingList(planning, localRecettes, localIngredients, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const oeuf = result.items_par_categorie['cremerie-oeufs']
      .find((i) => i.ingredient_id === 'oeuf-test-singulier');
    expect(oeuf?.quantite_totale).toBe(1);
    expect(oeuf?.unite_affichee).toBe('piece');
    expect(oeuf?.nom_affiche).toBe('Œuf test');
  });

  it('should use nom_pluriel for nom_affiche when quantite_totale > 1 (continuous kg)', () => {
    // pates-bolognaise + salade-tomate-basilic : tomate 400g + 600g = 1000g → 1 kg
    // 1 kg NOT > 1 → nom_singulier ; mais avec 2 recettes on obtient exactement 1 kg
    // Utilisation de nbParticipants=8 pour doubler : 1000g * 2 / 1000 = 2 kg > 1 → nom_pluriel
    const planning = makePlanning([
      { jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
      { jour: 1, repas: 'soir', recette_id: 'salade-tomate-basilic' },
    ]);
    const result = buildShoppingList(planning, recettesMap, ingredientsMap, 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tomate = result.items_par_categorie['fruits-legumes']
      .find((i) => i.ingredient_id === 'tomate');
    expect(tomate?.quantite_totale).toBe(2);
    expect(tomate?.nom_affiche).toBe('Tomates');
  });

  // === Cas d'erreur ===

  it('should return error invalid_participants when nbParticipants is zero or negative', () => {
    const planning = makePlanning([
      { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
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
      { jour: 1, repas: 'midi', recette_id: 'recette-inexistante-xyz' },
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
      { jour: 1, repas: 'midi', recette_id: 'recette-ingredient-fantome' },
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

});
