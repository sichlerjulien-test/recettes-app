/**
 * Schémas Zod pour validation runtime — source unique de vérité (ADR-002).
 *
 * domain.ts dérive ses types depuis ce fichier via z.infer<typeof XxxSchema>.
 *
 * Utilisation :
 *   - Chargement des YAML : RecetteSchema.parse(yaml)
 *   - Entrées API : CreateSejourBodySchema.parse(req.body)
 *   - Sortie LLM : LLMPlanningOutputSchema.parse(llmResponse)
 */

import { z } from 'zod';
import { EU14_ALLERGENS } from '../../../data/seed-allergenes';
import { DIETARY_RESTRICTIONS } from '../../../data/seed-dietary';

// ============================================================================
// PRIMITIVES
// ============================================================================

export const AllergenSchema = z.enum(EU14_ALLERGENS);
export const DietaryRestrictionSchema = z.enum(DIETARY_RESTRICTIONS);
export const ExclusionTagSchema = z.enum(DIETARY_RESTRICTIONS);

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

// Registre des unités — source de vérité pour la classification continue/discrète (ADR-007)
export const CONTINUOUS_UNITS = ['g', 'kg', 'ml', 'l', 'cuillere-soupe', 'cuillere-cafe'] as const;
export const DISCRETE_UNITS   = ['piece', 'botte', 'sachet'] as const;
export const UnitSchema = z.enum([...CONTINUOUS_UNITS, ...DISCRETE_UNITS]);
export const UniteBaseSchema = z.enum(['g', 'ml', 'piece']);
export type ContinuousUnit = typeof CONTINUOUS_UNITS[number];
export type DiscreteUnit   = typeof DISCRETE_UNITS[number];

export const EquipmentSchema = z.enum([
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
]);

export const MealTypeSchema = z.enum(['midi', 'soir', 'petit-dejeuner']);

export const SeasonSchema = z.enum(['printemps', 'ete', 'automne', 'hiver', 'toutes']);

export const DifficultySchema = z.enum(['facile', 'normale']);

export const CuisineTypeSchema = z.enum([
  'francaise', 'italienne', 'asiatique', 'mexicaine',
  'mediterraneenne', 'orientale', 'neutre', 'americaine', 'anglaise',
]);

export const MainIngredientSchema = z.enum([
  'poulet', 'boeuf', 'porc', 'agneau',
  'poisson', 'fruits-de-mer',
  'oeufs', 'legumineuses', 'fromage', 'tofu',
  'legumes', 'fruits', 'pain',
]);

export const DominantStarchSchema = z.enum([
  'pates', 'riz', 'pommes-de-terre', 'pain', 'semoule', 'quinoa', 'aucun',
]);

export const CookingLevelSchema = z.enum(['facile', 'normal']);

export const TimeAvailableSchema = z.enum(['rapide', 'standard']);

type ExclusionTag = typeof DIETARY_RESTRICTIONS[number];

const LEGACY_CONTRAINTES_REGIME_TO_EXCLUSION: Record<string, ExclusionTag> = {
  vegetarien: 'vegetarien',
  vegan: 'vegan',
};

function normalizeLegacyContraintesRegimes(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) return [];

  return value.map((regime) => {
    if (typeof regime === 'string' && regime in LEGACY_CONTRAINTES_REGIME_TO_EXCLUSION) {
      return LEGACY_CONTRAINTES_REGIME_TO_EXCLUSION[regime];
    }

    console.warn(
      `[schemas] ${context}: valeur legacy contraintes_utilisees inconnue, validation conserve l'erreur`,
      regime,
    );
    return regime;
  });
}

function normalizeLegacyContraintesRegimesToExclusions(input: unknown, context: string): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;

  const row = input as Record<string, unknown>;

  if ('exclusions' in row && row['exclusions'] !== undefined) {
    return row;
  }

  return {
    ...row,
    exclusions: normalizeLegacyContraintesRegimes(row['regimes'], context), // Clé JSONB legacy de plannings.contraintes_utilisees, distincte de la colonne participants.exclusions.
  };
}

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
  nom_singulier: z.string().min(1).max(100),
  nom_pluriel: z.string().min(1).max(100),
  categorie: IngredientCategorySchema,
  unite_base: UniteBaseSchema,
  unite_achat: UnitSchema,
  conversion: z.number().positive(),
  allergenes: z.array(AllergenSchema).default([]),
  contient_trace: z.array(AllergenSchema).default([]),
  substituts: z.array(SlugSchema).default([]),
  exclusion_tags: z.array(ExclusionTagSchema).default([]),
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
  difficulte: DifficultySchema,
  equipement: z.array(EquipmentSchema),
  type_repas: z.array(MealTypeSchema).min(1),
  type_cuisine: CuisineTypeSchema,
  saison: z.array(SeasonSchema).min(1),
  ingredient_principal: MainIngredientSchema,
  feculent_dominant: DominantStarchSchema,
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
  exclusions_compatibles: z.array(ExclusionTagSchema),
});

// ============================================================================
// PARTICIPANT & SEJOUR
// ============================================================================

export const ParticipantSchema = z.preprocess(
  (input) => input,
  z.object({
    id: z.string(),
    nom: z.string().min(1).max(50),
    allergies: z.array(AllergenSchema).default([]),
    exclusions: z.array(ExclusionTagSchema).default([]),
    aime: z.array(z.string()).default([]),
    n_aime_pas: z.array(z.string()).default([]),
  }),
);

export const SejourParametresSchema = z.object({
  niveau_cuisine: CookingLevelSchema,
  equipement_disponible: z.array(EquipmentSchema).min(1),
  temps_disponible: TimeAvailableSchema,
});

/** Entité Sejour complète (post-création, avec id et token). */
export const SejourSchema = z.object({
  id: z.string(),
  /** Token de partage signé HMAC, sert d'auth implicite */
  token: z.string(),
  nom: z.string().min(1).max(100),
  date_debut: z.string().optional(),
  nb_jours: z.number().int().min(1).max(7),
  /** Répartition des repas par jour */
  repartition_repas: z.object({
    premier_repas: z.enum(['matin', 'midi', 'soir']),
    midis: z.number().int().nonnegative(),
    soirs: z.number().int().nonnegative(),
    brunchs: z.number().int().nonnegative(),
  }),
  participants: z.array(ParticipantSchema),
  parametres: SejourParametresSchema,
  cree_le: z.string(),
});

// ============================================================================
// PLANNING (sortie LLM)
// ============================================================================

/** Format produit par le LLM : sans `portions` (calculées côté serveur). */
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

/** Entité PlanningEntry complète (avec portions calculées à partir des participants). */
export const PlanningEntryFullSchema = PlanningEntrySchema.extend({
  /** Calculé à partir du nombre de participants du séjour */
  portions: z.number().int().positive(),
});

/** Entité Planning complète. */
export const PlanningSchema = z.object({
  id: z.string(),
  sejour_id: z.string(),
  entries: z.array(PlanningEntryFullSchema),
  genere_le: z.string(),
  /** Trace des contraintes utilisées pour la génération (audit). */
  contraintes_utilisees: z.preprocess(
    (input) => normalizeLegacyContraintesRegimesToExclusions(input, 'contraintes_utilisees'),
    z.object({
      allergenes: z.array(AllergenSchema),
      exclusions: z.array(ExclusionTagSchema),
      equipement: z.array(EquipmentSchema),
    }),
  ),
});

// ============================================================================
// SHOPPING LIST
// ============================================================================

export const ShoppingItemSchema = z.object({
  ingredient_id: z.string(),
  nom_affiche: z.string(),
  quantite_totale: z.number().positive(),
  unite_affichee: UnitSchema,
  categorie: IngredientCategorySchema,
  optionnel: z.boolean(),
  /** Recettes du planning qui utilisent cet ingrédient (pour info) */
  utilise_dans: z.array(z.string()),
});

export const ShoppingListSchema = z.object({
  sejour_id: z.string(),
  planning_id: z.string(),
  items_par_categorie: z.record(IngredientCategorySchema, z.array(ShoppingItemSchema)),
  generee_le: z.string(),
});

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

/** Violation liée à un allergène EU14 déclaré par un participant. */
export const AllergenViolationSchema = z.object({
  kind: z.literal('allergen'),
  recette_id: z.string(),
  recette_nom: z.string(),
  allergene: AllergenSchema,
  participant_id: z.union([z.string(), z.undefined()]),
  participant_nom: z.union([z.string(), z.undefined()]),
});

/** Violation liée à une exclusion alimentaire déclarée par un participant. */
export const ExclusionViolationSchema = z.object({
  kind: z.literal('exclusion'),
  recette_id: z.string(),
  recette_nom: z.string(),
  exclusion: ExclusionTagSchema,
  participant_id: z.union([z.string(), z.undefined()]),
  participant_nom: z.union([z.string(), z.undefined()]),
});

/** Violation d'intégrité : l'entrée du planning référence une recette inconnue. */
export const RecetteInconnueViolationSchema = z.object({
  kind: z.literal('recette_inconnue'),
  recette_id: z.string(),
  participant_id: z.union([z.string(), z.undefined()]),
  participant_nom: z.union([z.string(), z.undefined()]),
});

/** Violation structurelle : les slots du planning ne correspondent pas aux slots attendus. */
export const SlotsMismatchViolationSchema = z.object({
  kind: z.literal('slots_mismatch'),
});

/** Violation structurelle : la même recette apparaît deux fois dans le planning. */
export const RecetteDupliqueeViolationSchema = z.object({
  kind: z.literal('recette_dupliquee'),
  recette_id: z.string(),
});

/** Violation structurelle : deux créneaux du même jour partagent le même ingredient_principal. */
export const IngredientConsecutifViolationSchema = z.object({
  kind: z.literal('ingredient_principal_consecutif'),
  ingredient_principal: MainIngredientSchema,
  slot_a: z.object({ jour: z.number(), repas: MealTypeSchema }),
  slot_b: z.object({ jour: z.number(), repas: MealTypeSchema }),
});

export const ValidationViolationSchema = z.discriminatedUnion('kind', [
  AllergenViolationSchema,
  ExclusionViolationSchema,
  RecetteInconnueViolationSchema,
  SlotsMismatchViolationSchema,
  RecetteDupliqueeViolationSchema,
  IngredientConsecutifViolationSchema,
]);

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  violations: z.array(ValidationViolationSchema),
});

// ============================================================================
// EXPORTS TYPES INFÉRÉS
// ============================================================================

export type IngredientInput = z.input<typeof IngredientSchema>;
export type IngredientOutput = z.infer<typeof IngredientSchema>;
export type RecetteInput = z.input<typeof RecetteInputSchema>;
export type RecetteOutput = z.infer<typeof RecetteInputSchema>;
export type LLMPlanningOutput = z.infer<typeof LLMPlanningOutputSchema>;

// ============================================================================
// LLM PLANNING GENERATION (cf. ADR-004)
// ============================================================================

export const GeneratePlanningInputSchema = z.object({
  pool: z.array(RecetteSchema),
  contexte: z.object({
    nb_jours: z.number().int().min(1).max(7),
    repartition_repas: z.object({
      premier_repas: z.enum(['matin', 'midi', 'soir']),
      midis: z.number().int().nonnegative(),
      soirs: z.number().int().nonnegative(),
      brunchs: z.number().int().nonnegative(),
    }),
    niveau_cuisine: z.enum(['facile', 'normal']),
    temps_disponible: z.enum(['rapide', 'standard']),
  }),
});

export const GeneratePlanningOutputSchema = z.object({
  entries: z.array(z.object({
    jour: z.number().int().positive(),
    repas: MealTypeSchema,
    recette_id: z.string(),
  })),
});

export const LLMErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pool_empty'), cause: z.enum(['allergen', 'exclusion']) }),
  z.object({
    kind: z.literal('validation_failed_after_retries'),
    lastViolations: z.array(ValidationViolationSchema),
  }),
  z.object({
    kind: z.literal('llm_unavailable'),
    cause: z.string(),
  }),
]);

// ============================================================================
// SHOPPING (cf. lib/shopping/)
// ============================================================================

export const ShoppingErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recette_inconnue'), recette_id: z.string() }),
  z.object({
    kind: z.literal('ingredient_inconnu'),
    recette_id: z.string(),
    ingredient_id: z.string(),
  }),
  z.object({
    kind: z.literal('invalid_participants'),
    nbParticipants: z.number(),
  }),
]);

export type ShoppingError = z.infer<typeof ShoppingErrorSchema>;

// ============================================================================
// INFRASTRUCTURE — DB ERRORS
// ============================================================================

export const DbErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('connection_failed'), cause: z.string() }),
  z.object({ kind: z.literal('query_failed'), cause: z.string() }),
  z.object({ kind: z.literal('row_validation_failed'), cause: z.string() }),
  z.object({ kind: z.literal('not_found'), entity: z.string(), id: z.string() }),
  z.object({ kind: z.literal('constraint_violation'), cause: z.string() }),
  z.object({
    kind: z.literal('schema_drift'),
    missing: z.array(z.object({ table: z.string(), column: z.string() })),
  }),
]);

// ============================================================================
// API INPUT SCHEMAS
// ============================================================================

export const CreateSejourBodySchema = z.object({
  nom: z.string().min(1).max(100).optional(),
  date_debut: z.string().date().optional(),
  nb_jours: z.number().int().min(1).max(7),
  repartition_repas: z.object({
    premier_repas: z.enum(['matin', 'midi', 'soir']),
    midis: z.number().int().nonnegative(),
    soirs: z.number().int().nonnegative(),
    brunchs: z.number().int().nonnegative(),
  }),
  parametres: SejourParametresSchema,
  participants: z.array(z.object({
    nom: z.string().min(1).max(50),
    allergies: z.array(AllergenSchema).default([]),
    exclusions: z.array(ExclusionTagSchema).default([]),
    aime: z.array(z.string()).default([]),
    n_aime_pas: z.array(z.string()).default([]),
  })).min(1).max(12),
});
