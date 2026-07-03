-- =============================================================================
-- 013-drop-allow-all-policies.sql
-- Supprime les policies allow_all_mvp sur sejours, participants, plannings.
--
-- Ces policies (USING true / WITH CHECK true) rendaient les trois tables
-- publiques en lecture/écriture pour tout détenteur de l'anon key — dont les
-- tokens de séjour et les allergies des participants. Ferme TK-54.
--
-- RLS reste ENABLE sur les trois tables (deny-by-default). L'app passe
-- exclusivement par service_role (bypass RLS, ADR-006) — aucun client browser
-- ne consomme la clé anon sur ces tables.
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : DROP POLICY IF EXISTS.
-- =============================================================================

DROP POLICY IF EXISTS allow_all_mvp ON public.participants;
DROP POLICY IF EXISTS allow_all_mvp ON public.plannings;
DROP POLICY IF EXISTS allow_all_mvp ON public.sejours;
