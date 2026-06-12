-- =============================================================================
-- 009-exclusions-null-sentinel.sql
-- Adopte NULL comme sentinelle "non-matérialisé" pour exclusions_compatibles.
--
-- 008 a créé la colonne avec DEFAULT '{}' NOT NULL. '{}' est ambigu :
-- valeur légitime ("aucune exclusion compatible") ET état non-matérialisé.
-- Entre migration 008 et un premier build-data, filterByExclusions produit
-- un faux pool_empty pour toute exclusion demandée — la recette n'est pas
-- exclue pour raison légitime, elle n'a simplement pas encore été calculée.
--
-- Correction : NULL = "non-matérialisé". Le runtime lève une erreur bruyante
-- sur NULL (jamais de faux pool_empty). build-data écrit TOUJOURS la colonne
-- (y compris []) — jamais NULL après un seed complet.
--
-- Supersède le commentaire de 008 ("comportement neutre") : '{}' n'est pas
-- neutre. Un pool vide dû à un DEFAULT non-matérialisé est un faux négatif.
--
-- Instance partagée dev/prod (ADR-008) :
--   1. Appliquer sur dev → npm run build-data → smoke test.
--   2. Appliquer sur prod à l'identique.
--   3. Diff pg_dump -s dev/prod doit être vide.
--
-- Idempotente : ALTER COLUMN ... DROP NOT NULL sur une colonne déjà nullable
-- est sans effet en PostgreSQL. Même chose pour SET DEFAULT NULL.
-- =============================================================================

ALTER TABLE recettes
  ALTER COLUMN exclusions_compatibles DROP NOT NULL,
  ALTER COLUMN exclusions_compatibles SET DEFAULT NULL;
