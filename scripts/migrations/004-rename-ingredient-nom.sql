-- =============================================================================
-- 004-rename-ingredient-nom.sql
-- TK-02 : migration consolidée et idempotente pour la table `ingredients`.
--
-- Opérations :
--   1. Renommage nom → nom_singulier  (si la colonne nom existe encore)
--   2. Ajout de la colonne nom_pluriel (si elle n'existe pas)
--
-- Exécution : SQL Editor Supabase → Run
-- Idempotente : chaque opération est gardée par IF EXISTS / IF NOT EXISTS.
-- =============================================================================

DO $$
BEGIN
  -- 1. Renommer nom → nom_singulier si la migration précédente n'a pas encore tourné
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'nom'
  ) THEN
    ALTER TABLE ingredients RENAME COLUMN nom TO nom_singulier;
  END IF;

  -- 2. Ajouter nom_pluriel si elle est absente
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'nom_pluriel'
  ) THEN
    ALTER TABLE ingredients ADD COLUMN nom_pluriel varchar(100) NOT NULL DEFAULT '';
  END IF;
END
$$;
