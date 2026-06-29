-- =============================================================================
-- 011-create-sejour-rpc.sql
-- Fonction transactionnelle create_sejour_with_participants.
--
-- Remplace les deux INSERT séquentiels de createSejour() (sejours puis
-- participants, hors transaction) par un bloc atomique : si l'INSERT
-- participants échoue, le rollback annule aussi l'INSERT sejour → zéro orphelin.
--
-- RETURNS jsonb : le DAL mappe et valide Zod directement, sans SELECT
-- post-écriture (ADR-018).
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_sejour_with_participants(
  p_token             text,
  p_nom               text,
  p_date_debut        date,     -- NULL si absent
  p_nb_jours          integer,
  p_repartition_repas jsonb,
  p_parametres        jsonb,
  p_participants      jsonb     -- [{nom, allergies, exclusions, aime, n_aime_pas}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_cree_le   timestamptz;
  v_parts_out jsonb;
BEGIN
  INSERT INTO sejours (token, nom, date_debut, nb_jours, repartition_repas, parametres)
  VALUES (p_token, p_nom, p_date_debut, p_nb_jours, p_repartition_repas, p_parametres)
  RETURNING id, cree_le INTO v_id, v_cree_le;

  INSERT INTO participants (sejour_id, nom, allergies, exclusions, aime, n_aime_pas)
  SELECT
    v_id,
    (p ->> 'nom')::text,
    ARRAY(SELECT jsonb_array_elements_text(p -> 'allergies')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'exclusions')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'aime')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'n_aime_pas'))
  FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) AS p;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',         id,
    'nom',        nom,
    'allergies',  to_jsonb(allergies),
    'exclusions', to_jsonb(exclusions),
    'aime',       to_jsonb(aime),
    'n_aime_pas', to_jsonb(n_aime_pas)
  )), '[]'::jsonb)
  INTO v_parts_out
  FROM participants
  WHERE sejour_id = v_id;

  RETURN jsonb_build_object(
    'id',                v_id,
    'token',             p_token,
    'nom',               p_nom,
    'date_debut',        p_date_debut,
    'nb_jours',          p_nb_jours,
    'repartition_repas', p_repartition_repas,
    'parametres',        p_parametres,
    'cree_le',           v_cree_le,
    'participants',      v_parts_out
  );
END;
$$;
