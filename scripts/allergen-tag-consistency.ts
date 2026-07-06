import { EU14_ALLERGENS } from '../data/seed-allergenes';

/**
 * Garde déterministe : si tags_libres porte "sans-${allergene}" pour un
 * allergène EU14, cet allergène ne doit PAS figurer dans allergenes_calcules.
 *
 * Ne matche que les 14 slugs EU14 littéraux (sans-gluten, sans-lait, …).
 * Les autres tags d'exclusion (sans-porc, sans-viande-rouge, sans-fruits-de-mer…)
 * ne sont pas des allergènes EU14 et sont ignorés — pas de matching flou.
 */
export function validateAllergenTagConsistency(
  recetteId: string,
  tagsLibres: readonly string[],
  allergenesCalcules: readonly string[],
): string[] {
  const errors: string[] = [];

  for (const allergene of EU14_ALLERGENS) {
    const tag = `sans-${allergene}`;
    if (tagsLibres.includes(tag) && allergenesCalcules.includes(allergene)) {
      errors.push(
        `[${recetteId}] tag "${tag}" incohérent : l'allergène "${allergene}" est présent dans allergenes_calcules`,
      );
    }
  }

  return errors;
}
