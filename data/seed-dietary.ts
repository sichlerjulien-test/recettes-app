/**
 * Régimes alimentaires traités comme contraintes dures.
 * Liste figée — toute modification doit faire l'objet d'un ADR explicite.
 */

export const DIETARY_RESTRICTIONS = [
  'sans-viande-rouge',
  'sans-porc',
  'sans-poisson',
  'sans-fruits-de-mer',
  'sans-alcool',
  'vegetarien',
  'vegan',
] as const;

export type DietaryRestriction = typeof DIETARY_RESTRICTIONS[number];

export function isDietaryRestriction(value: string): value is DietaryRestriction {
  return DIETARY_RESTRICTIONS.includes(value as DietaryRestriction);
}

export const DIETARY_LABELS: Record<DietaryRestriction, string> = {
  'sans-viande-rouge': 'Sans viande rouge',
  'sans-porc': 'Sans porc',
  'sans-poisson': 'Sans poisson',
  'sans-fruits-de-mer': 'Sans fruits de mer',
  'sans-alcool': 'Sans alcool',
  'vegetarien': 'Végétarien',
  'vegan': 'Vegan',
};
