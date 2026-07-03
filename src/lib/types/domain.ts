/**
 * Types du domaine métier Meal Planner.
 *
 * Source de vérité : src/lib/types/schemas.ts (schémas Zod).
 * Ce fichier dérive tous ses types via z.infer<typeof XxxSchema> (ADR-002).
 */

import type { z } from 'zod';
import type {
  IngredientCategorySchema,
  UnitSchema,
  DifficultySchema,
  EquipmentSchema,
  MealTypeSchema,
  CuisineTypeSchema,
  SeasonSchema,
  MainIngredientSchema,
  DominantStarchSchema,
  CookingLevelSchema,
  TimeAvailableSchema,
  IngredientSchema,
  RecipeIngredientSchema,
  RecetteSchema,
  ParticipantSchema,
  SejourParametresSchema,
  SejourSchema,
  PlanningEntryFullSchema,
  RecettePlanningEntryFullSchema,
  RestoPlanningEntrySchema,
  PlanningSchema,
  ShoppingItemSchema,
  ShoppingListSchema,
  AllergenViolationSchema,
  ExclusionViolationSchema,
  ExclusionTagSchema,
  RecetteInconnueViolationSchema,
  SlotsMismatchViolationSchema,
  RecetteDupliqueeViolationSchema,
  IngredientConsecutifViolationSchema,
  ValidationViolationSchema,
  ValidationResultSchema,
  ShoppingErrorSchema,
  DbErrorSchema,
} from './schemas';

// ============================================================================
// INGREDIENT
// ============================================================================

export type IngredientCategory = z.infer<typeof IngredientCategorySchema>;

export type Unit = z.infer<typeof UnitSchema>;

export type Ingredient = z.infer<typeof IngredientSchema>;

// ============================================================================
// RECETTE
// ============================================================================

export type Difficulty = z.infer<typeof DifficultySchema>;

export type Equipment = z.infer<typeof EquipmentSchema>;

export type MealType = z.infer<typeof MealTypeSchema>;

export type CuisineType = z.infer<typeof CuisineTypeSchema>;

export type Season = z.infer<typeof SeasonSchema>;

export type MainIngredient = z.infer<typeof MainIngredientSchema>;

export type DominantStarch = z.infer<typeof DominantStarchSchema>;

export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export type Recette = z.infer<typeof RecetteSchema>;

// ============================================================================
// SEJOUR
// ============================================================================

export type CookingLevel = z.infer<typeof CookingLevelSchema>;

export type TimeAvailable = z.infer<typeof TimeAvailableSchema>;

export type Sejour = z.infer<typeof SejourSchema>;

export type SejourParametres = z.infer<typeof SejourParametresSchema>;

export type Participant = z.infer<typeof ParticipantSchema>;

// ============================================================================
// PLANNING
// ============================================================================

/**
 * Entrée de planning porteuse de recette — forme historique (pré-TK-42).
 * C'est le seul type que consomme le sanctuaire allergens/dietary.
 * Pas de champ `kind` : toutes les entries d'un Planning sont des recettes.
 */
export type PlanningEntry = {
  jour: number;
  repas: MealType;
  recette_id: string;
  portions: number;
};

/** Variante recette d'une entrée de planning stockée (avec discriminant `kind`). */
export type RecettePlanningEntry = z.infer<typeof RecettePlanningEntryFullSchema>;

/** Variante resto : créneau non cuisiné, sans recette (ADR-022). */
export type RestoPlanningEntry = z.infer<typeof RestoPlanningEntrySchema>;

/**
 * Union discriminée des slots de planning — pour stockage DB, affichage et cohérence.
 * NE PAS utiliser comme type d'entrée du sanctuaire allergens/dietary.
 */
export type PlanningSlot = RecettePlanningEntry | RestoPlanningEntry;

/**
 * Planning tel que retourné par la DB — entries contient les deux kinds (ADR-022).
 * Utiliser pour : affichage, cohérence (slots_mismatch), swap, liste de courses.
 */
export type StoredPlanning = z.infer<typeof PlanningSchema>;

/**
 * Planning recette-only — ce que consomme le sanctuaire allergens/dietary.
 * entries ne contient jamais de slot resto.
 * Assignable depuis StoredPlanning via projection (filter kind='recette').
 */
export type Planning = Omit<StoredPlanning, 'entries'> & { entries: PlanningEntry[] };

// ============================================================================
// SHOPPING LIST
// ============================================================================

export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

export type ShoppingList = z.infer<typeof ShoppingListSchema>;

export type ShoppingError = z.infer<typeof ShoppingErrorSchema>;

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

/** Violation liée à un allergène EU14 déclaré par un participant. */
export type AllergenViolation = z.infer<typeof AllergenViolationSchema>;

/** Tag d'exclusion alimentaire (végétarien, vegan, …). */
export type ExclusionTag = z.infer<typeof ExclusionTagSchema>;

/** Violation liée à une exclusion alimentaire déclarée par un participant. */
export type ExclusionViolation = z.infer<typeof ExclusionViolationSchema>;

/** Violation d'intégrité : l'entrée du planning référence une recette inconnue. */
export type RecetteInconnueViolation = z.infer<typeof RecetteInconnueViolationSchema>;

/** Violation structurelle : les slots du planning ne correspondent pas aux slots attendus. */
export type SlotsMismatchViolation = z.infer<typeof SlotsMismatchViolationSchema>;

/** Violation structurelle : la même recette apparaît deux fois. */
export type RecetteDupliqueeViolation = z.infer<typeof RecetteDupliqueeViolationSchema>;

/** Violation structurelle : même ingredient_principal sur deux créneaux du même jour. */
export type IngredientConsecutifViolation = z.infer<typeof IngredientConsecutifViolationSchema>;

export type ValidationViolation = z.infer<typeof ValidationViolationSchema>;

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ============================================================================
// INFRASTRUCTURE
// ============================================================================

export type DbError = z.infer<typeof DbErrorSchema>;
