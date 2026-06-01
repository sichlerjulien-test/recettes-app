import { IngredientCategorySchema, DISCRETE_UNITS } from '../types/schemas';
import type {
  Planning,
  Recette,
  Ingredient,
  ShoppingItem,
  IngredientCategory,
  Unit,
  ShoppingError,
} from '../types/domain';

export type { ShoppingError };

export type BuildShoppingListResult =
  | { ok: true; items_par_categorie: Record<IngredientCategory, ShoppingItem[]> }
  | { ok: false; error: ShoppingError };

type AggregItem = {
  ingredient_id: string;
  unite: Unit;
  quantite_totale: number;
  optionnel: boolean;
  utilise_dans: Set<string>;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const DISCRETE_UNIT_SET = new Set<string>(DISCRETE_UNITS);
const finalize = (q: number, u: Unit): number =>
  DISCRETE_UNIT_SET.has(u) ? Math.ceil(q) : round2(q);

/**
 * Construit le contenu de la liste de courses à partir d'un planning.
 *
 * Fonction purement déterministe : mêmes inputs => mêmes outputs, sans aucun
 * effet de bord ni accès I/O. Les métadonnées de persistance (sejour_id,
 * planning_id, generee_le) ne font pas partie du résultat — elles sont à
 * remplir par le caller (route API ou couche de persistance).
 *
 * Agrège les ingrédients de toutes les recettes du planning, ajuste les
 * quantités au nombre de participants, et groupe le résultat par catégorie
 * d'achat.
 *
 * @param planning - Le planning du séjour (entries avec recette_id et portions)
 * @param recettes - Index de toutes les recettes disponibles, clé = recette_id
 * @param ingredients - Index de tous les ingrédients disponibles, clé = ingredient_id
 * @param nbParticipants - Nombre de participants effectifs pour le séjour (doit être > 0)
 * @returns `{ ok: true, items_par_categorie }` avec les items groupés par catégorie,
 *          ou `{ ok: false, error }` si une référence est manquante ou si nbParticipants est invalide
 *
 * @example
 * const result = buildShoppingList(planning, recettesMap, ingredientsMap, 4);
 * if (!result.ok) { console.error(result.error.kind); return; }
 * const tomates = result.items_par_categorie['fruits-legumes']
 *   .find(i => i.ingredient_id === 'tomate');
 * // tomates.quantite_totale => 1.5, tomates.unite_affichee => 'kg'
 */
export function buildShoppingList(
  planning: Planning,
  recettes: Map<string, Recette>,
  ingredients: Map<string, Ingredient>,
  nbParticipants: number,
): BuildShoppingListResult {
  if (nbParticipants <= 0) {
    return { ok: false, error: { kind: 'invalid_participants', nbParticipants } };
  }

  for (const entry of planning.entries) {
    const recette = recettes.get(entry.recette_id);
    if (recette === undefined) {
      return { ok: false, error: { kind: 'recette_inconnue', recette_id: entry.recette_id } };
    }
    for (const ri of recette.ingredients) {
      if (!ingredients.has(ri.ingredient_id)) {
        return {
          ok: false,
          error: {
            kind: 'ingredient_inconnu',
            recette_id: entry.recette_id,
            ingredient_id: ri.ingredient_id,
          },
        };
      }
    }
  }

  // Agrégation par (ingredient_id, unite) — deux unités différentes => deux items distincts
  const aggr = new Map<string, AggregItem>();

  for (const entry of planning.entries) {
    const recette = recettes.get(entry.recette_id)!;
    const facteur = nbParticipants / recette.portions_base;

    for (const ri of recette.ingredients) {
      const key = `${ri.ingredient_id}::${ri.unite}`;
      const quantite_brute = ri.quantite_base * facteur;

      const existing = aggr.get(key);
      if (existing !== undefined) {
        existing.quantite_totale += quantite_brute;
        // Non-optionnel dans au moins une recette => l'emporte sur optionnel
        if (!ri.optionnel) existing.optionnel = false;
        existing.utilise_dans.add(entry.recette_id);
      } else {
        aggr.set(key, {
          ingredient_id: ri.ingredient_id,
          unite: ri.unite,
          quantite_totale: quantite_brute,
          optionnel: ri.optionnel,
          utilise_dans: new Set([entry.recette_id]),
        });
      }
    }
  }

  // Initialiser toutes les catégories (même vides) et les remplir
  const items_par_categorie = Object.fromEntries(
    IngredientCategorySchema.options.map((cat) => [cat, [] as ShoppingItem[]]),
  ) as Record<IngredientCategory, ShoppingItem[]>;

  for (const aggItem of aggr.values()) {
    const ingredient = ingredients.get(aggItem.ingredient_id)!;

    let quantite_totale: number;
    let unite_affichee: Unit;

    // Convertir vers unite_achat uniquement si l'unité de la recette correspond à unite_base
    if (aggItem.unite === ingredient.unite_base) {
      unite_affichee = ingredient.unite_achat;
      quantite_totale = finalize(aggItem.quantite_totale / ingredient.conversion, unite_affichee);
    } else {
      unite_affichee = aggItem.unite;
      quantite_totale = finalize(aggItem.quantite_totale, unite_affichee);
    }

    items_par_categorie[ingredient.categorie].push({
      ingredient_id: aggItem.ingredient_id,
      nom_affiche: quantite_totale > 1 ? ingredient.nom_pluriel : ingredient.nom_singulier,
      quantite_totale,
      unite_affichee,
      categorie: ingredient.categorie,
      optionnel: aggItem.optionnel,
      utilise_dans: [...aggItem.utilise_dans],
    });
  }

  for (const cat of IngredientCategorySchema.options) {
    items_par_categorie[cat].sort((a, b) => a.nom_affiche.localeCompare(b.nom_affiche));
  }

  return { ok: true, items_par_categorie };
}
