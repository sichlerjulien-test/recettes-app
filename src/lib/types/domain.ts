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
  PlanningSchema,
  ShoppingItemSchema,
  ShoppingListSchema,
  AllergenViolationSchema,
  RegimeViolationSchema,
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

export type PlanningEntry = z.infer<typeof PlanningEntryFullSchema>;

export type Planning = z.infer<typeof PlanningSchema>;

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

/** Violation liée à un régime alimentaire déclaré par un participant. */
export type RegimeViolation = z.infer<typeof RegimeViolationSchema>;

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
