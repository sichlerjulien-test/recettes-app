/**
 * Types du domaine métier Meal Planner.
 *
 * Toutes les entités y sont définies. Ces types sont la source de vérité —
 * les schémas Zod (dans src/lib/types/schemas.ts) doivent en dériver.
 */

import type { Allergen, DietaryRestriction } from '../../../data/seed-allergenes';

// ============================================================================
// INGREDIENT
// ============================================================================

export type IngredientCategory =
  | 'fruits-legumes'
  | 'viandes-poissons'
  | 'cremerie-oeufs'
  | 'epicerie-salee'
  | 'epicerie-sucree'
  | 'feculents-pates-riz'
  | 'boulangerie'
  | 'surgele'
  | 'boissons'
  | 'condiments-epices'
  | 'frais-traiteur';

export type Unit =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'piece'
  | 'botte'
  | 'sachet'
  | 'cuillere-soupe'
  | 'cuillere-cafe';

export interface Ingredient {
  /** Slug unique, ex: "farine-ble-t55" */
  id: string;
  nom: string;
  nom_pluriel: string;
  categorie: IngredientCategory;
  unite_base: 'g' | 'ml' | 'piece';
  unite_achat: Unit;
  /** Facteur de conversion : 1 unite_achat = N unites_base */
  conversion: number;
  /** Allergènes EU14 contenus de manière certaine */
  allergenes: Allergen[];
  /** Allergènes possibles en trace (info, pas filtre dur) */
  contient_trace: Allergen[];
  /** IDs d'ingrédients de substitution */
  substituts: string[];
  /** Mois de saison (1-12), vide = toute l'année */
  saisonnalite?: number[];
  notes?: string;
}

// ============================================================================
// RECETTE
// ============================================================================

export type Difficulty = 'facile' | 'normale';

export type Equipment = 'four' | 'plaque' | 'micro-ondes' | 'barbecue' | 'blender' | 'robot';

export type MealType = 'midi' | 'soir' | 'brunch';

export type CuisineType =
  | 'francaise'
  | 'italienne'
  | 'asiatique'
  | 'mexicaine'
  | 'mediterraneenne'
  | 'orientale'
  | 'neutre';

export type Season = 'printemps' | 'ete' | 'automne' | 'hiver' | 'toutes';

export type MainIngredient =
  | 'poulet'
  | 'boeuf'
  | 'porc'
  | 'agneau'
  | 'poisson'
  | 'fruits-de-mer'
  | 'oeufs'
  | 'legumineuses'
  | 'fromage'
  | 'tofu'
  | 'legumes';

export type DominantStarch =
  | 'pates'
  | 'riz'
  | 'pommes-de-terre'
  | 'pain'
  | 'semoule'
  | 'quinoa'
  | 'aucun';

export interface RecipeIngredient {
  ingredient_id: string;
  /** Quantité pour portions_base personnes */
  quantite_base: number;
  unite: Unit;
  optionnel: boolean;
  /** Regroupement visuel, ex: "pour la sauce", "pour le dressage" */
  groupe?: string | undefined;
}

export interface Recette {
  id: string;
  nom: string;
  description: string;
  /** Nombre de personnes pour les quantités saisies */
  portions_base: number;
  /** Durée totale en minutes (incluant cuisson passive) */
  duree_minutes: number;
  /** Durée active en minutes (temps de présence requis) */
  duree_active: number;
  difficulte: Difficulty;
  equipement: Equipment[];
  type_repas: MealType[];
  type_cuisine: CuisineType;
  saison: Season[];
  ingredient_principal: MainIngredient;
  feculent_dominant: DominantStarch;
  ingredients: RecipeIngredient[];
  etapes: string[];
  tags_libres: string[];
  /**
   * CALCULÉ AU BUILD à partir des ingrédients. JAMAIS saisi à la main.
   * Source de vérité unique pour le filtre allergènes.
   */
  allergenes_calcules: Allergen[];
  /** Vrai si aucune viande, poisson, fruits de mer */
  est_vegetarien: boolean;
  /** Vrai si aucun produit animal (lait, œufs, miel, etc.) */
  est_vegan: boolean;
}

// ============================================================================
// SEJOUR
// ============================================================================

export type CookingLevel = 'facile' | 'normal';
export type TimeAvailable = 'rapide' | 'standard';

export interface Sejour {
  id: string;
  /** Token de partage signé HMAC, sert d'auth implicite */
  token: string;
  nom: string;
  date_debut?: string; // ISO date
  nb_jours: number; // 1-7
  /** Répartition des repas par jour */
  repartition_repas: {
    midis: number;
    soirs: number;
    brunchs: number;
  };
  participants: Participant[];
  parametres: SejourParametres;
  cree_le: string; // ISO datetime
}

export interface SejourParametres {
  niveau_cuisine: CookingLevel;
  equipement_disponible: Equipment[];
  temps_disponible: TimeAvailable;
}

export interface Participant {
  id: string;
  nom: string;
  allergies: Allergen[];
  /** Régimes traités comme contraintes dures */
  regimes: DietaryRestriction[];
  /** Préférences positives (tags libres curés) */
  aime: string[];
  /** Préférences négatives (tags libres curés) */
  n_aime_pas: string[];
}

// ============================================================================
// PLANNING
// ============================================================================

export interface PlanningEntry {
  jour: number; // 1-indexé
  repas: MealType;
  recette_id: string;
  /** Calculé à partir du nombre de participants du séjour */
  portions: number;
}

export interface Planning {
  id: string;
  sejour_id: string;
  entries: PlanningEntry[];
  genere_le: string;
  /** Trace des contraintes utilisées pour la génération (audit) */
  contraintes_utilisees: {
    allergenes: Allergen[];
    regimes: DietaryRestriction[];
    equipement: Equipment[];
  };
}

// ============================================================================
// SHOPPING LIST
// ============================================================================

export interface ShoppingItem {
  ingredient_id: string;
  nom_affiche: string;
  quantite_totale: number;
  unite_affichee: Unit;
  categorie: IngredientCategory;
  optionnel: boolean;
  /** Recettes du planning qui utilisent cet ingrédient (pour info) */
  utilise_dans: string[];
}

export interface ShoppingList {
  sejour_id: string;
  planning_id: string;
  items_par_categorie: Record<IngredientCategory, ShoppingItem[]>;
  generee_le: string;
}

// ============================================================================
// VALIDATION RESULTS
// ============================================================================

/** Violation liée à un allergène EU14 déclaré par un participant. */
export interface AllergenViolation {
  kind: 'allergen';
  recette_id: string;
  recette_nom: string;
  allergene: Allergen;
  participant_id: string | undefined;
  participant_nom: string | undefined;
}

/** Violation liée à un régime alimentaire déclaré par un participant. */
export interface RegimeViolation {
  kind: 'regime';
  recette_id: string;
  recette_nom: string;
  regime: DietaryRestriction;
  participant_id: string | undefined;
  participant_nom: string | undefined;
}

/** Violation d'intégrité : l'entrée du planning référence une recette inconnue. */
export interface RecetteInconnueViolation {
  kind: 'recette_inconnue';
  recette_id: string;
  participant_id: string | undefined;
  participant_nom: string | undefined;
}

export type ValidationViolation =
  | AllergenViolation
  | RegimeViolation
  | RecetteInconnueViolation;

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

// ============================================================================
// CHECK DE COHÉRENCE COMPILE-TIME
//
// Ce bloc garantit que l'interface `Recette` (source de vérité TypeScript)
// et le type `RecetteEnrichie` (inféré depuis `RecetteSchema` dans schemas.ts)
// restent structurellement équivalents.
//
// NE PAS SUPPRIMER. Si la compilation échoue ici, c'est qu'un champ a été
// ajouté ou modifié dans l'un des deux sans mettre à jour l'autre.
// Procédure de mise à jour :
//   1. Modifier le champ dans `domain.ts` (interface Recette)
//   2. Modifier le schéma correspondant dans `schemas.ts` (RecetteSchema)
//   3. Vérifier que ce check repasse avec `npx tsc --noEmit`
// ============================================================================
import type { RecetteEnrichie } from '@/lib/types/schemas';

type _AssertRecetteExtendsEnrichie = Recette extends RecetteEnrichie ? true : never;
type _AssertEnrichieExtendsRecette = RecetteEnrichie extends Recette ? true : never;

// Force l'évaluation des deux types conditionnels au compile-time.
const _coherenceCheck: [_AssertRecetteExtendsEnrichie, _AssertEnrichieExtendsRecette] = [true, true];
