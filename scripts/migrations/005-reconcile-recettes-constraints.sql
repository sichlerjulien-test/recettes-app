-- =============================================================================
-- 005-reconcile-recettes-constraints.sql
-- TK-07 : réconciliation des contraintes CHECK de la table `recettes`.
--
-- Opérations (dans l'ordre) :
--   1. Suppression de recettes_equipement_check (équipement vide légitime
--      pour les plats froids — pas de cuisson requise).
--   2. Remplacement de recettes_ingredient_principal_check par 13 valeurs :
--      union des valeurs DB (001) + Zod (schemas.ts), incluant 'fruits' et 'pain'.
--   3. Remplacement de recettes_type_cuisine_check par 9 valeurs,
--      incluant 'americaine' et 'anglaise' déjà présentes dans le schéma Zod.
--
-- Exécution : SQL Editor Supabase → Run
-- Idempotente : DROP IF EXISTS avant chaque ADD CONSTRAINT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. equipement — supprimer la contrainte cardinality > 0
--    (vide = légal pour les plats sans cuisson)
-- -----------------------------------------------------------------------------
ALTER TABLE recettes
  DROP CONSTRAINT IF EXISTS recettes_equipement_check;

-- -----------------------------------------------------------------------------
-- 2. ingredient_principal — 13 valeurs (union DB initiale + Zod)
-- -----------------------------------------------------------------------------
ALTER TABLE recettes
  DROP CONSTRAINT IF EXISTS recettes_ingredient_principal_check;

ALTER TABLE recettes
  ADD CONSTRAINT recettes_ingredient_principal_check
  CHECK (ingredient_principal IN (
    'poulet', 'boeuf', 'porc', 'agneau',
    'poisson', 'fruits-de-mer',
    'oeufs', 'legumineuses', 'fromage', 'tofu',
    'legumes', 'fruits', 'pain'
  ));

-- -----------------------------------------------------------------------------
-- 3. type_cuisine — 9 valeurs (aligne DB sur le schéma Zod)
-- -----------------------------------------------------------------------------
ALTER TABLE recettes
  DROP CONSTRAINT IF EXISTS recettes_type_cuisine_check;

ALTER TABLE recettes
  ADD CONSTRAINT recettes_type_cuisine_check
  CHECK (type_cuisine IN (
    'francaise', 'italienne', 'asiatique', 'mexicaine',
    'mediterraneenne', 'orientale', 'neutre',
    'americaine', 'anglaise'
  ));
