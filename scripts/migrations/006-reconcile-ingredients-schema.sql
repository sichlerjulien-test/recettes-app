-- Réconciliation du schéma `ingredients` de prod vers l'état canonique (dev).
-- Contexte : incident 500 sur /shopping-list. Prod avait dérivé du modèle courant :
--   - colonne `nom_singulier` absente (requise par le schéma Zod de lecture) ;
--   - colonnes héritées `nom`, `type_unite`, `unite_pluriel` non utilisées par le modèle actuel.
-- Enregistre la réconciliation appliquée à la main pendant l'incident.
-- Idempotente : no-op sur un environnement déjà canonique (dev).
-- ATTENTION ordre : le SET NOT NULL suppose `nom_singulier` déjà peuplé. Sur une table
--   préexistante non seedée, lancer build-data AVANT, ou déplacer cette dernière ligne après le seed.

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS nom_singulier text;
ALTER TABLE ingredients DROP COLUMN IF EXISTS nom;
ALTER TABLE ingredients DROP COLUMN IF EXISTS type_unite;
ALTER TABLE ingredients DROP COLUMN IF EXISTS unite_pluriel;
ALTER TABLE ingredients ALTER COLUMN nom_singulier SET NOT NULL;
