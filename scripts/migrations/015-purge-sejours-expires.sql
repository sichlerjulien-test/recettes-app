-- =============================================================================
-- 015-purge-sejours-expires.sql
-- Purge automatique des séjours expirés (ADR-024).
--
-- Rétention = 60 jours depuis cree_le (toujours peuplé, NOT NULL DEFAULT now()).
-- Le DELETE emporte les tables filles via ON DELETE CASCADE déjà en place
-- (participants, plannings, feedback — TK-56a) : c'est aussi le seul GC des
-- séjours orphelins (URL perdue, pas d'auth pour les récupérer).
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : CREATE EXTENSION IF NOT EXISTS, cron.schedule sur un job nommé
-- (re-schedule = no-op si le nom et la commande sont identiques ; unschedule
-- explicite avant re-schedule pour éviter les doublons en cas de rejeu).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge-sejours-expires';

SELECT cron.schedule(
  'purge-sejours-expires',
  '0 3 * * *',
  $$DELETE FROM public.sejours WHERE cree_le < now() - interval '60 days';$$
);
