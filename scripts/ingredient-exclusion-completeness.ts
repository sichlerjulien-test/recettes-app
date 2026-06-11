import type { IngredientOutput } from '../src/lib/types/schemas';

// ─── Régime 1 : ancré sur allergène EU14 ────────────────────────────────────
// Si un ingrédient déclare un allergène EU14, il DOIT porter le tag d'exclusion
// correspondant. Garde déterministe — le champ allergenes est la source de vérité.

const REQUIRED_EXCLUSION_TAGS_BY_ALLERGEN = [
  {
    allergen: 'poissons',
    tag: 'sans-poisson',
  },
  {
    allergen: 'crustaces',
    tag: 'sans-fruits-de-mer',
  },
  {
    allergen: 'mollusques',
    tag: 'sans-fruits-de-mer',
  },
] as const;

// ─── Régime 2 : curation tracée (porc / viande-rouge / alcool) ───────────────
// ADR-011 §9 : pas de garde catégorie automatique — curation manuelle tracée.
//
// Mécanisme :
//   TRIAGE_PORC / TRIAGE_VIANDE_ROUGE / TRIAGE_ALCOOL  listent les ingrédients
//   connus pour contenir la substance ; le garde vérifie que chacun porte bien
//   le tag requis. Si le tag est retiré par erreur → CI fail.
//
//   TRIAGE_COVERED  couvre toutes les catégories susceptibles (viandes-poissons,
//   frais-traiteur). Tout ingrédient dans ces catégories DOIT être dans
//   TRIAGE_COVERED. Un nouvel ingrédient non trié = CI fail.
//
// Maintenance : ajouter un ingrédient viande / charcuterie impose de :
//   1. L'ajouter à TRIAGE_COVERED (revue obligatoire)
//   2. L'ajouter à TRIAGE_PORC, TRIAGE_VIANDE_ROUGE ou les deux si applicable
//   3. Renseigner ses exclusion_tags dans le YAML

export const TRIAGE_PORC = new Set([
  'guanciale-ou-lardon',
  'jambon-blanc',
  'lardon-fume',
]);

export const TRIAGE_VIANDE_ROUGE = new Set([
  'boeuf-bourguignon',
  'boeuf-hache',
  'boeuf-tartare',
  'bouillon-boeuf',
  'steak-hache-boeuf',
]);

export const TRIAGE_ALCOOL = new Set([
  'biere-blonde',
  'vin-blanc-sec',
  'vin-rouge-cuisine',
]);

// Catégories dont TOUS les ingrédients doivent avoir été triés.
const SUSCEPTIBLE_CATEGORIES = new Set(['viandes-poissons', 'frais-traiteur']);

// Union des ingrédients revus : couvre viandes-poissons + frais-traiteur complets.
export const TRIAGE_COVERED = new Set([
  // Porc
  ...TRIAGE_PORC,
  // Viande rouge
  ...TRIAGE_VIANDE_ROUGE,
  // Volaille (végétarien filtré par categorie, pas par tag atomique)
  'cuisse-poulet',
  'filet-poulet',
  'poulet-blanc',
  'poulet-entier',
  // Poissons / fruits de mer (Régime 1 allergène couvre les tags)
  'anchois-boite',
  'crevettes-crues-decortiquees',
  'filet-cabillaud',
  'moules-bouchot',
  'saumon-frais',
  'saumon-fume',
  'thon-boite',
]);

export function validateIngredientExclusionCompleteness(
  ingredients: Map<string, IngredientOutput>,
): string[] {
  const errors: string[] = [];

  for (const [id, ingredient] of ingredients) {
    // ── Régime 1 : allergène → tag obligatoire ───────────────────────────────
    for (const rule of REQUIRED_EXCLUSION_TAGS_BY_ALLERGEN) {
      if (
        ingredient.allergenes.includes(rule.allergen) &&
        !ingredient.exclusion_tags.includes(rule.tag)
      ) {
        errors.push(
          `[${id}.yaml] allergène "${rule.allergen}" exige exclusion_tags: "${rule.tag}"`,
        );
      }
    }

    // ── Régime 2 : tag checks sur ingrédients triés ──────────────────────────
    if (TRIAGE_PORC.has(id) && !ingredient.exclusion_tags.includes('sans-porc')) {
      errors.push(`[${id}.yaml] triage porc : exige exclusion_tags: "sans-porc"`);
    }
    if (TRIAGE_VIANDE_ROUGE.has(id) && !ingredient.exclusion_tags.includes('sans-viande-rouge')) {
      errors.push(`[${id}.yaml] triage viande-rouge : exige exclusion_tags: "sans-viande-rouge"`);
    }
    if (TRIAGE_ALCOOL.has(id) && !ingredient.exclusion_tags.includes('sans-alcool')) {
      errors.push(`[${id}.yaml] triage alcool : exige exclusion_tags: "sans-alcool"`);
    }

    // ── Régime 2 : couverture des catégories susceptibles ───────────────────
    if (SUSCEPTIBLE_CATEGORIES.has(ingredient.categorie) && !TRIAGE_COVERED.has(id)) {
      errors.push(
        `[${id}.yaml] catégorie "${ingredient.categorie}" susceptible — ajoutez cet ingrédient à TRIAGE_COVERED dans scripts/ingredient-exclusion-completeness.ts`,
      );
    }
  }

  return errors;
}
