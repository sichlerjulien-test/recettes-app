import {
  EU14_ALLERGENS,
  DIETARY_RESTRICTIONS,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
} from '../../../data/seed-allergenes';
import type { IngredientCategory, MainIngredient } from '../types/domain';

export type { Allergen, DietaryRestriction } from '../../../data/seed-allergenes';
export { EU14_ALLERGENS, DIETARY_RESTRICTIONS };
export { ALLERGEN_LABELS };
export const REGIME_LABELS = DIETARY_LABELS;

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  'fruits-legumes': 'Fruits & légumes',
  'boulangerie': 'Boulangerie',
  'cremerie-oeufs': 'Crémerie & œufs',
  'viandes-poissons': 'Viandes & poissons',
  'surgele': 'Surgelé',
  'epicerie-salee': 'Épicerie salée',
  'feculents-pates-riz': 'Féculents, pâtes & riz',
  'epicerie-sucree': 'Épicerie sucrée',
  'condiments-epices': 'Condiments & épices',
  'boissons': 'Boissons',
  'frais-traiteur': 'Frais & traiteur',
};

export const MAIN_INGREDIENT_LABELS: Record<MainIngredient, string> = {
  'poulet':        'Poulet',
  'boeuf':         'Bœuf',
  'porc':          'Porc',
  'agneau':        'Agneau',
  'poisson':       'Poisson',
  'fruits-de-mer': 'Fruits de mer',
  'oeufs':         'Œufs',
  'legumineuses':  'Légumineuses',
  'fromage':       'Fromage',
  'tofu':          'Tofu',
  'legumes':       'Légumes',
  'fruits':        'Fruits',
  'pain':          'Pain',
};

export const CATEGORY_ORDER: IngredientCategory[] = [
  'fruits-legumes',
  'boulangerie',
  'cremerie-oeufs',
  'viandes-poissons',
  'surgele',
  'epicerie-salee',
  'feculents-pates-riz',
  'epicerie-sucree',
  'condiments-epices',
  'boissons',
  'frais-traiteur',
];
