import type { RecipeIngredient, Ingredient, Unit } from '../types/domain';
import { CONTINUOUS_UNITS } from '../types/schemas';

const UNIT_LABELS: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  'cuillere-soupe': 'c. à soupe',
  'cuillere-cafe': 'c. à café',
};

function isContinuous(unite: Unit): boolean {
  return (CONTINUOUS_UNITS as readonly string[]).includes(unite);
}

function scaleQuantity(quantiteBase: number, entryPortions: number, portionsBase: number): number {
  return Math.round(quantiteBase * (entryPortions / portionsBase));
}

/**
 * Formate un ingrédient de recette avec quantité mise à l'échelle.
 * Règles ADR-007 : discret → nom pluriel/singulier sans unité ;
 * continu → "{q}{unité} de {nom_singulier}".
 * Fallback si ingrédient absent de la map : "{quantité} {slug}".
 */
export function formatIngredientRecette(
  ri: RecipeIngredient,
  ingredient: Ingredient | undefined,
  entryPortions: number,
  portionsBase: number,
): string {
  const continuous = isContinuous(ri.unite);
  const q = scaleQuantity(ri.quantite_base, entryPortions, portionsBase);

  if (!ingredient) {
    return `${q} ${ri.ingredient_id}`;
  }

  if (continuous) {
    const unitLabel = UNIT_LABELS[ri.unite] ?? ri.unite;
    return `${q}${unitLabel} de ${ingredient.nom_singulier}`;
  }

  const nom = q > 1 ? ingredient.nom_pluriel : ingredient.nom_singulier;
  return `${q} ${nom}`;
}
