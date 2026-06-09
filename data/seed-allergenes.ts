/**
 * Liste figée des 14 allergènes à déclaration obligatoire en Union Européenne.
 *
 * Source : Règlement INCO (UE) n°1169/2011, annexe II.
 *
 * RÈGLE ABSOLUE : cette liste est immuable. Aucune saisie libre n'est tolérée
 * dans l'application. Toute modification de cette liste doit faire l'objet
 * d'un ADR explicite.
 */

export const EU14_ALLERGENS = [
  'gluten',         // Céréales contenant du gluten (blé, seigle, orge, avoine, épeautre, kamut)
  'crustaces',      // Crustacés et produits à base de crustacés
  'oeufs',          // Œufs et produits à base d'œufs
  'poissons',       // Poissons et produits à base de poissons
  'arachides',      // Arachides et produits à base d'arachides
  'soja',           // Soja et produits à base de soja
  'lait',           // Lait et produits laitiers (y compris lactose)
  'fruits-coque',   // Fruits à coque (amandes, noisettes, noix, etc.)
  'celeri',         // Céleri et produits à base de céleri
  'moutarde',       // Moutarde et produits à base de moutarde
  'sesame',         // Graines de sésame
  'sulfites',       // Anhydride sulfureux et sulfites > 10 mg/kg
  'lupin',          // Lupin et produits à base de lupin
  'mollusques',     // Mollusques et produits à base de mollusques
] as const;

/**
 * Type strict dérivé de la liste figée.
 * Toute valeur de type Allergen est garantie d'appartenir à EU14_ALLERGENS.
 */
export type Allergen = typeof EU14_ALLERGENS[number];

/**
 * Type guard utilitaire pour valider qu'une string est un allergène EU14.
 * À utiliser systématiquement avant tout cast.
 */
export function isAllergen(value: string): value is Allergen {
  return EU14_ALLERGENS.includes(value as Allergen);
}

/**
 * Libellés humains pour affichage UI. Centralisés ici pour éviter
 * la dispersion et garantir l'i18n future.
 */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  'gluten': 'Gluten',
  'crustaces': 'Crustacés',
  'oeufs': 'Œufs',
  'poissons': 'Poissons',
  'arachides': 'Arachides',
  'soja': 'Soja',
  'lait': 'Lait et produits laitiers',
  'fruits-coque': 'Fruits à coque',
  'celeri': 'Céleri',
  'moutarde': 'Moutarde',
  'sesame': 'Sésame',
  'sulfites': 'Sulfites',
  'lupin': 'Lupin',
  'mollusques': 'Mollusques',
};

