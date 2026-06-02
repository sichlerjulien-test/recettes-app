import { describe, it, expect } from 'vitest';
import { RecetteInputSchema } from '@/lib/types/schemas';

// Fixture minimale valide.
const BASE = {
  id: 'salade-verte',
  nom: 'Salade verte',
  description: 'Salade sans cuisson.',
  portions_base: 4,
  duree_minutes: 10,
  duree_active: 5,
  difficulte: 'facile',
  equipement: [],
  type_repas: ['midi'],
  type_cuisine: 'francaise',
  saison: ['toutes'],
  ingredient_principal: 'legumes',
  feculent_dominant: 'aucun',
  ingredients: [{ ingredient_id: 'laitue', quantite_base: 200, unite: 'g', optionnel: false }],
  etapes: ['Laver et essorer la laitue.'],
  tags_libres: [],
};

// Les 13 valeurs doivent correspondre exactement au CHECK de la migration 005.
const VALEURS_INGREDIENT_PRINCIPAL = [
  'poulet', 'boeuf', 'porc', 'agneau',
  'poisson', 'fruits-de-mer',
  'oeufs', 'legumineuses', 'fromage', 'tofu',
  'legumes', 'fruits', 'pain',
] as const;

describe('RecetteInputSchema — ingredient_principal', () => {
  it.each(VALEURS_INGREDIENT_PRINCIPAL)(
    'accepte ingredient_principal = %s',
    (valeur) => {
      expect(() =>
        RecetteInputSchema.parse({ ...BASE, ingredient_principal: valeur }),
      ).not.toThrow();
    },
  );

  it('rejette une valeur inconnue', () => {
    expect(() =>
      RecetteInputSchema.parse({ ...BASE, ingredient_principal: 'inconnu' }),
    ).toThrow();
  });
});

describe('RecetteInputSchema — equipement', () => {
  it('accepte equipement vide (plat froid, sans cuisson)', () => {
    // Ce test doit échouer si une contrainte .min(1) ou .nonempty() est ajoutée.
    expect(() => RecetteInputSchema.parse({ ...BASE, equipement: [] })).not.toThrow();
  });

  it('accepte equipement avec une valeur', () => {
    expect(() => RecetteInputSchema.parse({ ...BASE, equipement: ['four'] })).not.toThrow();
  });

  it('rejette une valeur d\'équipement inconnue', () => {
    expect(() => RecetteInputSchema.parse({ ...BASE, equipement: ['micro-vapeur'] })).toThrow();
  });
});
