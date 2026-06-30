import { computeRecipeMetadata } from '@/lib/allergens/compute';
import { computeDietaryMetadata } from '@/lib/dietary/compute';
import type { Recette } from '@/lib/types/domain';
import { ingredientsMap } from './ingredients';

type RecetteBase = Omit<Recette, 'allergenes_calcules' | 'exclusions_compatibles'>;

const RECETTES_BASE: RecetteBase[] = [

  // ─── Végétariennes non-vegan ────────────────────────────────────────────────

  {
    id: 'omelette-legumes',
    nom: 'Omelette aux légumes',
    description: 'Omelette simple aux oignons.',
    portions_base: 2,
    duree_minutes: 15, duree_active: 15,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'oeufs',
    feculent_dominant: 'aucun',
    ingredients: [
      { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',      quantite_base: 100, unite: 'g',     optionnel: false, groupe: undefined },
    ],
    etapes: ['Battre les œufs.', 'Cuire à la poêle avec les oignons.'],
    tags_libres: ['rapide'],
  },

  {
    id: 'gratin-dauphinois',
    nom: 'Gratin dauphinois',
    description: 'Gratin de pommes de terre au lait.',
    portions_base: 4,
    duree_minutes: 60, duree_active: 20,
    difficulte: 'facile',
    equipement: ['four'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'pommes-de-terre',
    ingredients: [
      { ingredient_id: 'pomme-de-terre', quantite_base: 800, unite: 'g',  optionnel: false, groupe: undefined },
      { ingredient_id: 'lait-entier',    quantite_base: 400, unite: 'ml', optionnel: false, groupe: undefined },
    ],
    etapes: ['Éplucher et trancher les pommes de terre.', 'Cuire au four.'],
    tags_libres: ['hiver'],
  },

  // ─── Vegan strictes ─────────────────────────────────────────────────────────

  {
    id: 'salade-tomate-basilic',
    nom: 'Salade tomate basilic',
    description: 'Salade fraîche de saison.',
    portions_base: 4,
    duree_minutes: 10, duree_active: 10,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'mediterraneenne',
    saison: ['ete'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'aucun',
    ingredients: [
      { ingredient_id: 'tomate',  quantite_base: 600, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',  quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Couper les légumes.', 'Assaisonner.'],
    tags_libres: ['rapide', 'vegan'],
  },

  {
    id: 'riz-saute-legumes',
    nom: 'Riz sauté aux légumes',
    description: 'Riz sauté à la poêle avec des légumes de saison.',
    portions_base: 4,
    duree_minutes: 20, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'asiatique',
    saison: ['toutes'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'riz',
    ingredients: [
      { ingredient_id: 'riz-basmati', quantite_base: 300, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'tomate',      quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte',     quantite_base: 150, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Cuire le riz.', 'Faire sauter les légumes.', 'Mélanger.'],
    tags_libres: ['vegan'],
  },

  // ─── Carnées avec gluten ────────────────────────────────────────────────────

  {
    id: 'pates-bolognaise',
    nom: 'Pâtes bolognaise',
    description: 'Classique de la cuisine italienne.',
    portions_base: 4,
    duree_minutes: 35, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'italienne',
    saison: ['toutes'],
    ingredient_principal: 'boeuf',
    feculent_dominant: 'pates',
    ingredients: [
      { ingredient_id: 'penne',       quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'tomate',      quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Faire revenir le bœuf.', 'Ajouter la tomate.', 'Cuire les pâtes.'],
    tags_libres: [],
  },

  {
    id: 'burger-maison',
    nom: 'Burger maison',
    description: 'Burger avec pain de mie et steak haché.',
    portions_base: 4,
    duree_minutes: 20, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'neutre',
    saison: ['toutes'],
    ingredient_principal: 'boeuf',
    feculent_dominant: 'pain',
    ingredients: [
      { ingredient_id: 'pain-de-mie', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'tomate',      quantite_base: 200, unite: 'g',     optionnel: false, groupe: undefined },
    ],
    etapes: ['Griller le steak.', 'Assembler le burger.'],
    tags_libres: [],
  },

  // ─── Allergènes multiples ───────────────────────────────────────────────────

  {
    id: 'carbonara-classique',
    nom: 'Carbonara classique',
    description: 'Pâtes carbonara avec œufs et parmesan.',
    portions_base: 4,
    duree_minutes: 25, duree_active: 25,
    difficulte: 'normale',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'italienne',
    saison: ['toutes'],
    ingredient_principal: 'porc',
    feculent_dominant: 'pates',
    ingredients: [
      { ingredient_id: 'penne',       quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'parmesan',    quantite_base: 80,  unite: 'g',     optionnel: false, groupe: undefined },
    ],
    etapes: ['Cuire les pâtes.', 'Préparer la sauce.', 'Mélanger hors du feu.'],
    tags_libres: ['classique'],
  },

  {
    id: 'pad-thai',
    nom: 'Pad Thaï',
    description: 'Plat thaïlandais aux crevettes, cacahuètes et sauce soja.',
    portions_base: 4,
    duree_minutes: 25, duree_active: 25,
    difficulte: 'normale',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'asiatique',
    saison: ['toutes'],
    ingredient_principal: 'poisson',
    feculent_dominant: 'riz',
    ingredients: [
      { ingredient_id: 'crevettes',   quantite_base: 300, unite: 'g',  optionnel: false, groupe: undefined },
      { ingredient_id: 'cacahuetes',  quantite_base: 80,  unite: 'g',  optionnel: false, groupe: undefined },
      { ingredient_id: 'sauce-soja',  quantite_base: 60,  unite: 'ml', optionnel: false, groupe: undefined },
      { ingredient_id: 'riz-basmati', quantite_base: 300, unite: 'g',  optionnel: false, groupe: undefined },
    ],
    etapes: ['Cuire le riz.', 'Sauter crevettes et légumes.', 'Ajouter sauce soja.', 'Parsemer de cacahuètes.'],
    tags_libres: [],
  },

  // ─── Recettes "piégeuses" : ingrédient optionnel allergène ─────────────────

  {
    id: 'carbonara-sans-parmesan',
    nom: 'Carbonara sans parmesan',
    description: 'Carbonara allégée, parmesan en option.',
    portions_base: 4,
    duree_minutes: 25, duree_active: 25,
    difficulte: 'normale',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'italienne',
    saison: ['toutes'],
    ingredient_principal: 'porc',
    feculent_dominant: 'pates',
    ingredients: [
      { ingredient_id: 'penne',       quantite_base: 400, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'oeuf-entier', quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'parmesan',    quantite_base: 80,  unite: 'g',     optionnel: true,  groupe: 'garniture' },
    ],
    etapes: ['Cuire les pâtes.', 'Préparer la sauce.', 'Ajouter parmesan si souhaité.'],
    tags_libres: [],
  },

  {
    id: 'curry-poulet-sans-cacahuetes',
    nom: 'Curry de poulet (sans cacahuètes)',
    description: 'Curry doux, cacahuètes en décoration optionnelle.',
    portions_base: 4,
    duree_minutes: 35, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'orientale',
    saison: ['toutes'],
    ingredient_principal: 'poulet',
    feculent_dominant: 'riz',
    ingredients: [
      { ingredient_id: 'tomate',     quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte',    quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'cacahuetes', quantite_base: 50,  unite: 'g', optionnel: true,  groupe: 'garniture' },
    ],
    etapes: ['Cuire les légumes.', 'Ajouter le curry.', 'Parsemer de cacahuètes si souhaité.'],
    tags_libres: [],
  },

  // ─── Nécessitent four uniquement ────────────────────────────────────────────

  {
    id: 'quiche-lorraine',
    nom: 'Quiche lorraine',
    description: 'Quiche traditionnelle.',
    portions_base: 6,
    duree_minutes: 60, duree_active: 20,
    difficulte: 'normale',
    equipement: ['four'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'porc',
    feculent_dominant: 'pain',
    ingredients: [
      { ingredient_id: 'pate-brisee-industrielle', quantite_base: 250, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'oeuf-entier',              quantite_base: 4,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'lait-entier',              quantite_base: 200, unite: 'ml',    optionnel: false, groupe: undefined },
    ],
    etapes: ['Foncer le moule.', "Préparer l'appareil.", 'Cuire 35 min.'],
    tags_libres: [],
  },

  {
    id: 'souffle-fromage',
    nom: 'Soufflé au fromage',
    description: 'Soufflé léger au parmesan.',
    portions_base: 4,
    duree_minutes: 40, duree_active: 20,
    difficulte: 'normale',
    equipement: ['four'],
    type_repas: ['soir'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'fromage',
    feculent_dominant: 'aucun',
    ingredients: [
      { ingredient_id: 'oeuf-entier', quantite_base: 6,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'parmesan',    quantite_base: 100, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'farine-ble',  quantite_base: 30,  unite: 'g',     optionnel: false, groupe: undefined },
    ],
    etapes: ['Préparer la béchamel.', 'Incorporer les blancs.', 'Cuire au four.'],
    tags_libres: [],
  },

  // ─── Midi uniquement (2) ────────────────────────────────────────────────────

  {
    id: 'salade-midi',
    nom: 'Salade du midi',
    description: 'Salade fraîche pour le déjeuner.',
    portions_base: 4,
    duree_minutes: 10, duree_active: 10,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'aucun',
    ingredients: [
      { ingredient_id: 'tomate',  quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte', quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',  quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Couper.', 'Assaisonner.'],
    tags_libres: ['rapide'],
  },

  {
    id: 'soupe-legumes-midi',
    nom: 'Soupe de légumes',
    description: 'Soupe maison pour le déjeuner.',
    portions_base: 4,
    duree_minutes: 30, duree_active: 15,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi'],
    type_cuisine: 'francaise',
    saison: ['automne', 'hiver'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'pommes-de-terre',
    ingredients: [
      { ingredient_id: 'carotte',        quantite_base: 300, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',         quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'pomme-de-terre', quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Éplucher les légumes.', "Cuire dans l'eau.", 'Mixer.'],
    tags_libres: [],
  },

  // ─── Soir uniquement (2) ────────────────────────────────────────────────────

  {
    id: 'raclette-soir',
    nom: 'Raclette du soir',
    description: 'Raclette conviviale pour le dîner.',
    portions_base: 4,
    duree_minutes: 30, duree_active: 30,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['soir'],
    type_cuisine: 'francaise',
    saison: ['automne', 'hiver'],
    ingredient_principal: 'fromage',
    feculent_dominant: 'pommes-de-terre',
    ingredients: [
      { ingredient_id: 'pomme-de-terre', quantite_base: 800, unite: 'g',  optionnel: false, groupe: undefined },
      { ingredient_id: 'lait-entier',    quantite_base: 100, unite: 'ml', optionnel: false, groupe: undefined },
      { ingredient_id: 'parmesan',       quantite_base: 200, unite: 'g',  optionnel: false, groupe: undefined },
    ],
    etapes: ['Cuire les pommes de terre.', 'Servir avec le fromage fondu.'],
    tags_libres: ['convivial'],
  },

  {
    id: 'tajine-agneau-soir',
    nom: 'Tajine de bœuf',
    description: 'Tajine parfumé à la viande et aux légumes pour le dîner.',
    portions_base: 4,
    duree_minutes: 90, duree_active: 20,
    difficulte: 'normale',
    equipement: ['plaque'],
    type_repas: ['soir'],
    type_cuisine: 'orientale',
    saison: ['toutes'],
    ingredient_principal: 'boeuf',
    feculent_dominant: 'semoule',
    ingredients: [
      { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'tomate',      quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',      quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte',     quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Saisir la viande.', 'Ajouter les légumes.', 'Mijoter 1h.'],
    tags_libres: [],
  },

  // ─── Végétariennes au sésame (2) ───────────────────────────────────────────
  // Ces recettes ciblent le profil intensif "vegetarien-allergique" :
  // elles sont végétariennes (apparaissent dans le pool) mais contiennent
  // sesame-graines en non-optionnel (doivent être exclues par le filtre).

  {
    id: 'riz-saute-sesame',
    nom: 'Riz sauté au sésame',
    description: 'Riz sauté à la poêle avec carottes et graines de sésame.',
    portions_base: 4,
    duree_minutes: 20, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'asiatique',
    saison: ['toutes'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'riz',
    ingredients: [
      { ingredient_id: 'riz-basmati',    quantite_base: 300, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'carotte',        quantite_base: 200, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'sesame-graines', quantite_base: 30,  unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Cuire le riz.', 'Sauter les carottes.', 'Parsemer de sésame et mélanger.'],
    tags_libres: ['vegan'],
  },

  {
    id: 'salade-carottes-sesame',
    nom: 'Salade de carottes au sésame',
    description: 'Salade fraîche de carottes râpées aux graines de sésame.',
    portions_base: 4,
    duree_minutes: 10, duree_active: 10,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi', 'soir'],
    type_cuisine: 'neutre',
    saison: ['toutes'],
    ingredient_principal: 'legumes',
    feculent_dominant: 'aucun',
    ingredients: [
      { ingredient_id: 'carotte',        quantite_base: 400, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'oignon',         quantite_base: 100, unite: 'g', optionnel: false, groupe: undefined },
      { ingredient_id: 'sesame-graines', quantite_base: 20,  unite: 'g', optionnel: false, groupe: undefined },
    ],
    etapes: ['Râper les carottes.', 'Émincer l\'oignon.', 'Assaisonner et parsemer de sésame.'],
    tags_libres: ['vegan', 'rapide'],
  },

  // ─── Brunch (1) ──────────────────────────────────────────────────────────────

  {
    id: 'pancakes-brunch',
    nom: 'Pancakes',
    description: 'Pancakes moelleux pour le brunch.',
    portions_base: 4,
    duree_minutes: 20, duree_active: 20,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['petit-dejeuner'],
    type_cuisine: 'neutre',
    saison: ['toutes'],
    ingredient_principal: 'oeufs',
    feculent_dominant: 'pain',
    ingredients: [
      { ingredient_id: 'farine-ble',  quantite_base: 250, unite: 'g',     optionnel: false, groupe: undefined },
      { ingredient_id: 'oeuf-entier', quantite_base: 2,   unite: 'piece', optionnel: false, groupe: undefined },
      { ingredient_id: 'lait-entier', quantite_base: 300, unite: 'ml',    optionnel: false, groupe: undefined },
    ],
    etapes: ['Mélanger les ingrédients.', 'Cuire à la poêle.'],
    tags_libres: ['brunch'],
  },
];

export const recettesMap: Map<string, Recette> = new Map(
  RECETTES_BASE.map((base) => {
    const { allergenes_calcules } = computeRecipeMetadata(base, ingredientsMap);
    const { exclusions_compatibles } = computeDietaryMetadata(base, ingredientsMap);
    const recette: Recette = { ...base, allergenes_calcules, exclusions_compatibles };
    return [recette.id, recette];
  }),
);

export function getRecette(id: string): Recette {
  const recette = recettesMap.get(id);
  if (recette === undefined) {
    throw new Error(`Recette de fixture introuvable : "${id}"`);
  }
  return recette;
}

export function allRecettes(): Recette[] {
  return [...recettesMap.values()];
}
