-- =============================================================================
-- 008-add-exclusions-compatibles.sql
-- Ajoute la colonne exclusions_compatibles sur la table recettes.
--
-- Additive et sûre : IF NOT EXISTS, DEFAULT '{}', NOT NULL.
-- Instance partagée dev/prod (ADR-008) : sécurisé pour une application directe.
--
-- Backfill : la valeur correcte est poussée par le prochain run de build-data.
-- Tant que build-data n'a pas tourné, la colonne vaut '{}' pour les lignes
-- existantes — comportement neutre (filtre sans exclusion = aucun filtrage).
-- =============================================================================

ALTER TABLE recettes
  ADD COLUMN IF NOT EXISTS exclusions_compatibles text[] NOT NULL DEFAULT '{}';
