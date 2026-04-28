import 'server-only';
import { z } from 'zod';
import { getSupabaseClient } from './supabase';
import { IngredientSchema } from '../types/schemas';
import type { Ingredient } from '../types/domain';
import type { DbError } from './types';

type IngredientsResult =
  | { ok: true; ingredients: Ingredient[] }
  | { ok: false; error: DbError };

type IngredientsMapResult =
  | { ok: true; ingredients: Map<string, Ingredient> }
  | { ok: false; error: DbError };

type IngredientResult =
  | { ok: true; ingredient: Ingredient }
  | { ok: false; error: DbError };

// Convertit une ligne brute Supabase en objet compatible avec IngredientSchema.
// saisonnalite et notes sont nullable en DB mais optionnels dans le schéma Zod :
// on omet les propriétés si null pour respecter exactOptionalPropertyTypes.
function mapIngredientRow(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  const row = item as Record<string, unknown>;

  return {
    id: row['id'],
    nom: row['nom'],
    nom_pluriel: row['nom_pluriel'],
    categorie: row['categorie'],
    unite_base: row['unite_base'],
    unite_achat: row['unite_achat'],
    conversion: row['conversion'],
    allergenes: row['allergenes'],
    contient_trace: row['contient_trace'],
    substituts: row['substituts'],
    ...(row['saisonnalite'] !== null ? { saisonnalite: row['saisonnalite'] } : {}),
    ...(row['notes'] !== null ? { notes: row['notes'] } : {}),
  };
}

/**
 * Retourne l'ensemble des ingrédients du catalogue.
 */
export async function getAllIngredients(): Promise<IngredientsResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('ingredients').select('*');

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  const raw: unknown = data;
  if (!Array.isArray(raw)) {
    return { ok: false, error: { kind: 'query_failed', cause: 'Format de réponse inattendu' } };
  }

  const mapped = raw.map(mapIngredientRow);
  const parsed = z.array(IngredientSchema).safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, ingredients: parsed.data };
}

/**
 * Retourne tous les ingrédients indexés par leur id.
 * Pratique pour les calculs de liste de courses (accès O(1) par ingredient_id).
 */
export async function getAllIngredientsAsMap(): Promise<IngredientsMapResult> {
  const result = await getAllIngredients();

  if (!result.ok) return result;

  const map = new Map<string, Ingredient>(
    result.ingredients.map((i) => [i.id, i]),
  );

  return { ok: true, ingredients: map };
}

/**
 * Retourne un ingrédient par son identifiant slug.
 * Retourne une erreur not_found si l'ingrédient n'existe pas.
 */
export async function getIngredientById(id: string): Promise<IngredientResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null) {
    return { ok: false, error: { kind: 'not_found', entity: 'ingredient', id } };
  }

  const mapped = mapIngredientRow(data);
  const parsed = IngredientSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, ingredient: parsed.data };
}
