/**
 * Registre enum Zod ↔ CHECK SQL d'appartenance. Gate CI statique (ADR-015).
 *
 * Toute nouvelle paire (enum Zod, table, colonne) doit être ajoutée ici.
 * Le gate CI `enum-check-gate` asserte l'égalité d'ensembles entre ces valeurs
 * et les ARRAY[...] des CONSTRAINT CHECK de schema/canonical.sql.
 */

import {
  IngredientCategorySchema,
  UnitSchema,
  UniteBaseSchema,
  DifficultySchema,
  CuisineTypeSchema,
  MainIngredientSchema,
  DominantStarchSchema,
} from '../types/schemas';

export interface EnumContractEntry {
  table: string;
  column: string;
  values: readonly string[];
}

export const ENUM_CONTRACT: readonly EnumContractEntry[] = [
  { table: 'ingredients',        column: 'categorie',           values: IngredientCategorySchema.options },
  { table: 'ingredients',        column: 'unite_achat',         values: UnitSchema.options },
  { table: 'ingredients',        column: 'unite_base',          values: UniteBaseSchema.options },
  { table: 'recette_ingredients', column: 'unite',              values: UnitSchema.options },
  { table: 'recettes',           column: 'difficulte',          values: DifficultySchema.options },
  { table: 'recettes',           column: 'feculent_dominant',   values: DominantStarchSchema.options },
  { table: 'recettes',           column: 'ingredient_principal', values: MainIngredientSchema.options },
  { table: 'recettes',           column: 'type_cuisine',        values: CuisineTypeSchema.options },
];
