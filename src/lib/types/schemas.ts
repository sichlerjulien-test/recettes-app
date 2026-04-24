/**
 * Schémas Zod pour validation runtime.
 *
 * Ces schémas DOIVENT rester alignés avec les types dans index.ts.
 * Si tu modifies un type, mets à jour le schéma associé immédiatement.
 *
 * Utilisation :
 *   - Chargement des YAML : RecetteSchema.parse(yaml)
 *   - Entrées API : SejourCreateSchema.parse(req.body)
 *   - Sortie LLM : PlanningEntriesSchema.parse(llmResponse)
 */

import { z } from 'zod';
import { EU14_ALLERGENS, DIETARY_RESTRICTIONS } from '../../../data/seed-allergenes';

// ============================================================================
// PRIMITIVES
// ============================================================================

export const AllergenSchema = z.enum(EU14_ALLERGENS);
export const DietaryRestrictionSchema = z.enum(DIETARY_RESTRICTIONS);

export const IngredientCategorySchema = z.enum([
  'fruits-legumes',
  'viandes-poissons',
  'cremerie-oeufs',
  'epicerie-salee',
  'epicerie-sucree',
  'feculents-pates-riz',
  'boulangerie',
  'surgele',
  'boissons',
  'condiments-epices',
  'frais-traiteur',
]);

export const UnitSchema = z.enum([
  'g', 'kg', 'ml', 'l', 'piece',
  'botte', 'sachet', 'cuillere-soupe', 'cuillere-cafe',
]);

export const EquipmentSchema = z.enum([
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
]);

export const MealTypeSchema = z.enum(['midi', 'soir', 'brunch']);

export const SeasonSchema = z.enum(['printemps', 'ete', 'automne', 'hiver', 'toutes']);

// Slug : minuscules, chiffres, tirets uniquement
const SlugSchema = z.string().regex(
  /^[a-z0-9]+(-[a-z0-9]+)*$/,
  'Doit être un slug valide (minuscules, chiffres, tirets)',
);

// ============================================================================
// INGREDIENT
// ============================================================================

export const IngredientSchema = z.object({
  id: SlugSchema,
  nom: z.string().min(1).max(100),
  nom_pluriel: z.string().min(1).max(100),
  categorie: IngredientCategorySchema,
  unite_base: z.enum(['g', 'ml', 'piece']),
  unite_achat: UnitSchema,
  conversion: z.number().positive(),
  allergenes: z.array(AllergenSchema).default([]),
  contient_trace: z.array(AllergenSchema).default([]),
  substituts: z.array(SlugSchema).default([]),
  saisonnalite: z.array(z.number().int().min(1).max(12)).optional(),
  notes: z.string().optional(),
});

// ============================================================================
// RECETTE
// ============================================================================

export const RecipeIngredientSchema = z.object({
  ingredient_id: SlugSchema,
  quantite_base: z.number().positive(),
  unite: UnitSchema,
  optionnel: z.boolean().default(false),
  groupe: z.string().optional(),
});

/**
 * Schéma pour les YAML de recettes EN ENTRÉE.
 * Le champ `allergenes_calcules` n'y figure PAS — il est calculé au build.
 * Idem pour `est_vegetarien` et `est_vegan` (dérivés des ingrédients).
 */
export const RecetteInputSchema = z.object({
  id: SlugSchema,
  nom: z.string().min(1).max(150),
  description: z.string().max(500),
  portions_base: z.number().int().positive().max(20),
  duree_minutes: z.number().int().positive().max(480),
  duree_active: z.number().int().nonnegative().max(480),
  difficulte: z.enum(['facile', 'normale']),
  equipement: z.array(EquipmentSchema).min(1),
  type_repas: z.array(MealTypeSchema).min(1),
  type_cuisine: z.enum([
    'francaise', 'italienne', 'asiatique', 'mexicaine',
    'mediterraneenne', 'orientale', 'neutre',
  ]),
  saison: z.array(SeasonSchema).min(1),
  ingredient_principal: z.enum([
    'poulet', 'boeuf', 'porc', 'agneau', 'poisson', 'fruits-de-mer',
    'oeufs', 'legumineuses', 'fromage', 'tofu', 'legumes',
  ]),
  feculent_dominant: z.enum([
    'pates', 'riz', 'pommes-de-terre', 'pain',
    'semoule', 'quinoa', 'aucun',
  ]),
  ingredients: z.array(RecipeIngredientSchema).min(1),
  etapes: z.array(z.string().min(1)).min(1),
  tags_libres: z.array(z.string()).default([]),
}).refine(
  (data) => data.duree_active <= data.duree_minutes,
  { message: 'duree_active ne peut pas dépasser duree_minutes' },
);

/**
 * Schéma de la recette ENRICHIE après build (avec champs calculés).
 */
export const RecetteSchema = RecetteInputSchema.extend({
  allergenes_calcules: z.array(AllergenSchema),
  est_vegetarien: z.boolean(),
  est_vegan: z.boolean(),
});

/**
 * Équivalent runtime de l'interface `Recette` définie dans `domain.ts`.
 * Ce type est inféré de `RecetteSchema` (source de vérité Zod) et doit
 * rester structurellement identique à `Recette`.
 * Toute divergence entre les deux est détectée au compile-time par le
 * check de cohérence en bas de `domain.ts`.
 */
export type RecetteEnrichie = z.infer<typeof RecetteSchema>;

// ============================================================================
// PARTICIPANT & SEJOUR
// ============================================================================

export const ParticipantSchema = z.object({
  id: z.string(),
  nom: z.string().min(1).max(50),
  allergies: z.array(AllergenSchema).default([]),
  regimes: z.array(DietaryRestrictionSchema).default([]),
  aime: z.array(z.string()).default([]),
  n_aime_pas: z.array(z.string()).default([]),
});

export const SejourParametresSchema = z.object({
  niveau_cuisine: z.enum(['facile', 'normal']),
  equipement_disponible: z.array(EquipmentSchema).min(1),
  temps_disponible: z.enum(['rapide', 'standard']),
});

export const SejourCreateSchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  date_debut: z.string().datetime().optional(),
  nb_jours: z.number().int().min(1).max(7),
  repartition_repas: z.object({
    midis: z.number().int().nonnegative(),
    soirs: z.number().int().nonnegative(),
    brunchs: z.number().int().nonnegative(),
  }).refine(
    (r) => r.midis + r.soirs + r.brunchs > 0,
    { message: 'Au moins un repas doit être planifié' },
  ),
});

// ============================================================================
// PLANNING (sortie LLM)
// ============================================================================

export const PlanningEntrySchema = z.object({
  jour: z.number().int().positive(),
  repas: MealTypeSchema,
  recette_id: SlugSchema,
});

/**
 * Schéma strict pour parser la sortie du LLM.
 * Le LLM doit produire EXACTEMENT cette structure, sans champs supplémentaires.
 */
export const LLMPlanningOutputSchema = z.object({
  planning: z.array(PlanningEntrySchema).min(1),
});

// ============================================================================
// EXPORTS TYPES INFÉRÉS
// ============================================================================

export type IngredientInput = z.input<typeof IngredientSchema>;
export type IngredientOutput = z.infer<typeof IngredientSchema>;
export type RecetteInput = z.input<typeof RecetteInputSchema>;
export type RecetteOutput = z.infer<typeof RecetteInputSchema>;
export type SejourCreateInput = z.input<typeof SejourCreateSchema>;
export type LLMPlanningOutput = z.infer<typeof LLMPlanningOutputSchema>;
