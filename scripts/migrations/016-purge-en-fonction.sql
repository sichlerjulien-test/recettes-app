-- =============================================================================
-- 016-purge-en-fonction.sql
-- Extrait le DELETE de 015 en fonction appelable (TK-56c), pour pouvoir la
-- prouver par un test d'intégration au lieu de la déployer sans preuve.
--
-- 015 est immuable (ADR-008/013) : cette migration reschedule le job pg_cron
-- pour appeler la fonction plutôt que de dupliquer le DELETE inline. Cron et
-- test tapent la même fonction — le typo ne peut plus se cacher dans l'un
-- sans casser l'autre.
--
-- Rétention = 60 jours depuis cree_le (ADR-024, valeurs non re-dérivées).
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : CREATE OR REPLACE FUNCTION, unschedule du job 015 par jobname
-- (nom connu et figé : 'purge-sejours-expires') puis cron.schedule sur un
-- nouveau job nommé — no-op si déjà appliqué.
-- =============================================================================

CREATE OR REPLACE FUNCTION purge_expired_sejours()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM sejours WHERE cree_le < now() - interval '60 days';
END;
$$;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge-sejours-expires';

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge-expired-sejours';

SELECT cron.schedule(
  'purge-expired-sejours',
  '0 3 * * *',
  $$SELECT purge_expired_sejours();$$
);
