import type { Ingredient } from '@/lib/types/domain';

const INGREDIENTS: Ingredient[] = [
  // ─── Sans allergène (5) ────────────────────────────────────────────────────
  {
    id: 'tomate', nom_singulier: 'Tomate', nom_pluriel: 'Tomates',
    categorie: 'fruits-legumes', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'riz-basmati', nom_singulier: 'Riz basmati', nom_pluriel: 'Riz basmati',
    categorie: 'feculents-pates-riz', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'pomme-de-terre', nom_singulier: 'Pomme de terre', nom_pluriel: 'Pommes de terre',
    categorie: 'fruits-legumes', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'carotte', nom_singulier: 'Carotte', nom_pluriel: 'Carottes',
    categorie: 'fruits-legumes', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'oignon', nom_singulier: 'Oignon', nom_pluriel: 'Oignons',
    categorie: 'fruits-legumes', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },

  // ─── 1 allergène (5) ───────────────────────────────────────────────────────
  {
    id: 'farine-ble', nom_singulier: 'Farine de blé', nom_pluriel: 'Farines de blé',
    categorie: 'epicerie-salee', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['gluten'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'lait-entier', nom_singulier: 'Lait entier', nom_pluriel: 'Laits entiers',
    categorie: 'cremerie-oeufs', unite_base: 'ml', unite_achat: 'l',
    conversion: 1000, allergenes: ['lait'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'oeuf-entier', nom_singulier: 'Œuf entier', nom_pluriel: 'Œufs entiers',
    categorie: 'cremerie-oeufs', unite_base: 'piece', unite_achat: 'piece',
    conversion: 1, allergenes: ['oeufs'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'cacahuetes', nom_singulier: 'Cacahuètes', nom_pluriel: 'Cacahuètes',
    categorie: 'epicerie-salee', unite_base: 'g', unite_achat: 'g',
    conversion: 1, allergenes: ['arachides'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'saumon-frais', nom_singulier: 'Saumon frais', nom_pluriel: 'Saumons frais',
    categorie: 'viandes-poissons', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['poissons'], contient_trace: [], substituts: [], exclusion_tags: [],
  },

  // ─── 2-3 allergènes (5) ────────────────────────────────────────────────────
  {
    id: 'pate-brisee-industrielle', nom_singulier: 'Pâte brisée industrielle',
    nom_pluriel: 'Pâtes brisées industrielles',
    categorie: 'epicerie-salee', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['gluten', 'lait', 'oeufs'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'sauce-soja', nom_singulier: 'Sauce soja', nom_pluriel: 'Sauces soja',
    categorie: 'condiments-epices', unite_base: 'ml', unite_achat: 'ml',
    conversion: 1, allergenes: ['soja', 'gluten'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'pesto-industriel', nom_singulier: 'Pesto industriel', nom_pluriel: 'Pestos industriels',
    categorie: 'condiments-epices', unite_base: 'g', unite_achat: 'g',
    conversion: 1, allergenes: ['fruits-coque', 'lait'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'penne', nom_singulier: 'Penne', nom_pluriel: 'Penne',
    categorie: 'feculents-pates-riz', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['gluten'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'crevettes', nom_singulier: 'Crevettes', nom_pluriel: 'Crevettes',
    categorie: 'viandes-poissons', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['crustaces'], contient_trace: [], substituts: [], exclusion_tags: [],
  },

  // ─── Pour tests vegan / produits laitiers (3) ──────────────────────────────
  // parmesan : piégeux optionnel #1 (lait)
  {
    id: 'parmesan', nom_singulier: 'Parmesan', nom_pluriel: 'Parmesans',
    categorie: 'cremerie-oeufs', unite_base: 'g', unite_achat: 'g',
    conversion: 1, allergenes: ['lait'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'beurre', nom_singulier: 'Beurre', nom_pluriel: 'Beurres',
    categorie: 'cremerie-oeufs', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: ['lait'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'boeuf-hache', nom_singulier: 'Bœuf haché', nom_pluriel: 'Bœufs hachés',
    categorie: 'viandes-poissons', unite_base: 'g', unite_achat: 'kg',
    conversion: 1000, allergenes: [], contient_trace: [], substituts: [], exclusion_tags: [],
  },

  // ─── Piégeux optionnel #2 ──────────────────────────────────────────────────
  // noix-cajou : fruits-coque, utilisé avec optionnel=true dans certaines recettes
  {
    id: 'noix-cajou', nom_singulier: 'Noix de cajou', nom_pluriel: 'Noix de cajou',
    categorie: 'epicerie-salee', unite_base: 'g', unite_achat: 'g',
    conversion: 1, allergenes: ['fruits-coque'], contient_trace: [], substituts: [], exclusion_tags: [],
  },

  // ─── Compléments ───────────────────────────────────────────────────────────
  {
    id: 'pain-de-mie', nom_singulier: 'Pain de mie', nom_pluriel: 'Pains de mie',
    categorie: 'boulangerie', unite_base: 'piece', unite_achat: 'piece',
    conversion: 1, allergenes: ['gluten', 'lait'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
  {
    id: 'sesame-graines', nom_singulier: 'Graines de sésame', nom_pluriel: 'Graines de sésame',
    categorie: 'condiments-epices', unite_base: 'g', unite_achat: 'g',
    conversion: 1, allergenes: ['sesame'], contient_trace: [], substituts: [], exclusion_tags: [],
  },
];

export const ingredientsMap: Map<string, Ingredient> = new Map(
  INGREDIENTS.map((i) => [i.id, i]),
);

export function getIngredient(id: string): Ingredient {
  const ingredient = ingredientsMap.get(id);
  if (ingredient === undefined) {
    throw new Error(`Ingrédient de fixture introuvable : "${id}"`);
  }
  return ingredient;
}
