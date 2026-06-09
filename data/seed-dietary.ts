/**
 * Régimes alimentaires traités comme contraintes dures.
 * Liste figée — toute modification doit faire l'objet d'un ADR explicite.
 */

export const DIETARY_RESTRICTIONS = [
  'vegetarien',
  'vegan',
] as const;

export type DietaryRestriction = typeof DIETARY_RESTRICTIONS[number];

export function isDietaryRestriction(value: string): value is DietaryRestriction {
  return DIETARY_RESTRICTIONS.includes(value as DietaryRestriction);
}

export const DIETARY_LABELS: Record<DietaryRestriction, string> = {
  'vegetarien': 'Végétarien',
  'vegan': 'Vegan',
};
