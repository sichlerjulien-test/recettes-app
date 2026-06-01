-- =============================================================================
-- 004-rename-ingredient-nom.sql
-- TK-02 : renommage de la colonne `nom` → `nom_singulier` dans `ingredients`.
--
-- Exécution : SQL Editor Supabase → Run
-- Idempotent : ALTER TABLE … RENAME COLUMN échoue si la colonne n'existe pas,
-- mais une vérification préalable permet de l'exécuter sans erreur fatale.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'nom'
  ) THEN
    ALTER TABLE ingredients RENAME COLUMN nom TO nom_singulier;
  END IF;
END
$$;
