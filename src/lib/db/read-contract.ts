/**
 * Contrat de lecture explicite au bord DB (ADR-014).
 *
 * Map { table → colonnes requises[] } reprenant la forme de ligne que le DAL
 * attend AVANT mapping, dérivée de la table H1 du brief TK-16.
 * Maintenu manuellement : toute nouvelle colonne lue par le DAL doit apparaître ici.
 *
 * participants est write-only d'après H1 → exclu de ce contrat.
 */
export const READ_CONTRACT: Record<string, readonly string[]> = {
  recettes: [
    'id', 'nom', 'description', 'portions_base', 'duree_minutes', 'duree_active',
    'difficulte', 'equipement', 'type_repas', 'type_cuisine', 'saison',
    'ingredient_principal', 'feculent_dominant', 'etapes', 'tags_libres',
    'allergenes_calcules', 'exclusions_compatibles',
  ],
  recette_ingredients: [
    'ingredient_id', 'quantite_base', 'unite', 'optionnel', 'groupe', 'position',
  ],
  plannings: ['id', 'sejour_id', 'entries', 'genere_le', 'contraintes_utilisees'],
  ingredients: [
    'id', 'nom_singulier', 'nom_pluriel', 'categorie', 'unite_base', 'unite_achat',
    'conversion', 'allergenes', 'contient_trace', 'substituts', 'saisonnalite', 'notes',
  ],
};
