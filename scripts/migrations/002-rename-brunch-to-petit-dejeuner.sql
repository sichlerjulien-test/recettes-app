-- Migration 002 : renommage 'brunch' → 'petit-dejeuner'
--
-- 'brunch' était un alias historique de 'petit-dejeuner'. Cette migration
-- normalise les données existantes vers la valeur canonique.

-- recettes.type_repas (text[])
UPDATE recettes
SET type_repas = array_replace(type_repas, 'brunch', 'petit-dejeuner')
WHERE 'brunch' = ANY(type_repas);

-- plannings.entries (jsonb) — champ repas dans chaque entrée du tableau
UPDATE plannings
SET entries = (
  SELECT jsonb_agg(
    CASE
      WHEN entry->>'repas' = 'brunch'
      THEN jsonb_set(entry, '{repas}', '"petit-dejeuner"')
      ELSE entry
    END
  )
  FROM jsonb_array_elements(entries) AS entry
)
WHERE entries @> '[{"repas": "brunch"}]';
