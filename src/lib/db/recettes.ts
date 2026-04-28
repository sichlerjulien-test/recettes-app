import 'server-only';
import { z } from 'zod';
import { getSupabaseClient } from './supabase';
import { RecetteSchema } from '../types/schemas';
import type { Recette } from '../types/domain';
import type { DbError } from '../types/domain';

type RecettesResult =
  | { ok: true; recettes: Recette[] }
  | { ok: false; error: DbError };

type RecettesMapResult =
  | { ok: true; recettes: Map<string, Recette> }
  | { ok: false; error: DbError };

type RecetteResult =
  | { ok: true; recette: Recette }
  | { ok: false; error: DbError };

// Trie les lignes recette_ingredients par position croissante.
function byPosition(a: unknown, b: unknown): number {
  const posA = typeof a === 'object' && a !== null
    ? Number((a as Record<string, unknown>)['position'])
    : 0;
  const posB = typeof b === 'object' && b !== null
    ? Number((b as Record<string, unknown>)['position'])
    : 0;
  return (isNaN(posA) ? 0 : posA) - (isNaN(posB) ? 0 : posB);
}

// Convertit une ligne recette_ingredients en RecipeIngredient Zod-compatible.
// groupe est nullable en DB mais optionnel (string | undefined) dans le schéma Zod :
// on omet la propriété si null pour respecter exactOptionalPropertyTypes.
function mapRecetteIngredientRow(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  const ri = item as Record<string, unknown>;
  const base = {
    ingredient_id: ri['ingredient_id'],
    quantite_base: ri['quantite_base'],
    unite: ri['unite'],
    optionnel: ri['optionnel'],
  };
  return ri['groupe'] !== null && ri['groupe'] !== undefined
    ? { ...base, groupe: ri['groupe'] }
    : base;
}

// Convertit une ligne brute Supabase (recette + recette_ingredients imbriqués)
// en objet compatible avec RecetteSchema : renomme recette_ingredients → ingredients,
// trie par position, supprime created_at / updated_at absents du schéma métier.
function mapRecetteRow(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  const row = item as Record<string, unknown>;

  const rawIngredients = row['recette_ingredients'];
  const ingredients = Array.isArray(rawIngredients)
    ? [...rawIngredients].sort(byPosition).map(mapRecetteIngredientRow)
    : [];

  return {
    id: row['id'],
    nom: row['nom'],
    description: row['description'],
    portions_base: row['portions_base'],
    duree_minutes: row['duree_minutes'],
    duree_active: row['duree_active'],
    difficulte: row['difficulte'],
    equipement: row['equipement'],
    type_repas: row['type_repas'],
    type_cuisine: row['type_cuisine'],
    saison: row['saison'],
    ingredient_principal: row['ingredient_principal'],
    feculent_dominant: row['feculent_dominant'],
    etapes: row['etapes'],
    tags_libres: row['tags_libres'],
    allergenes_calcules: row['allergenes_calcules'],
    est_vegetarien: row['est_vegetarien'],
    est_vegan: row['est_vegan'],
    ingredients,
  };
}

/**
 * Retourne l'ensemble des recettes du catalogue avec leurs ingrédients.
 * Les ingrédients sont triés par leur position dans la recette.
 */
export async function getAllRecettes(): Promise<RecettesResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('recettes')
    .select('*, recette_ingredients(*)');

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  const raw: unknown = data;
  if (!Array.isArray(raw)) {
    return { ok: false, error: { kind: 'query_failed', cause: 'Format de réponse inattendu' } };
  }

  const mapped = raw.map(mapRecetteRow);
  const parsed = z.array(RecetteSchema).safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, recettes: parsed.data };
}

/**
 * Retourne une recette par son identifiant slug.
 * Retourne une erreur not_found si la recette n'existe pas.
 */
export async function getRecetteById(id: string): Promise<RecetteResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('recettes')
    .select('*, recette_ingredients(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null) {
    return { ok: false, error: { kind: 'not_found', entity: 'recette', id } };
  }

  const mapped = mapRecetteRow(data);
  const parsed = RecetteSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, recette: parsed.data };
}

/**
 * Retourne toutes les recettes indexées par leur id.
 * Pratique pour generatePlanning qui a besoin d'accès O(1) par recette_id.
 */
export async function getAllRecettesAsMap(): Promise<RecettesMapResult> {
  const result = await getAllRecettes();

  if (!result.ok) return result;

  const map = new Map<string, Recette>(
    result.recettes.map((r) => [r.id, r]),
  );

  return { ok: true, recettes: map };
}
