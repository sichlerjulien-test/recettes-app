-- Migration 013 : table feedback (signal négatif append-only, TK-43)
-- planning_id stocké comme text snapshot sans FK — les plannings sont append-only
-- (chaque swap crée un nouveau planning) ; une FK ON DELETE CASCADE détruirait
-- les feedbacks d'audit si un vieux planning était purgé.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sejour_id   uuid        NOT NULL REFERENCES public.sejours(id) ON DELETE CASCADE,
  planning_id text        NOT NULL,
  jour        integer     NOT NULL CHECK (jour > 0),
  repas       text        NOT NULL CHECK (repas IN ('midi', 'soir', 'petit-dejeuner')),
  recette_id  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
-- Aucune CREATE POLICY : deny-by-default. Le service_role bypasse le RLS (ADR-003).
