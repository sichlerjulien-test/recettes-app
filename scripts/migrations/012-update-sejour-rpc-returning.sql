-- =============================================================================
-- 012-update-sejour-rpc-returning.sql
-- Réécrit update_sejour_with_participants : RETURNS void → RETURNS jsonb.
--
-- PostgreSQL interdit CREATE OR REPLACE pour changer le type de retour d'une
-- fonction existante. On DROP d'abord (IF EXISTS pour idempotence), puis on
-- crée la nouvelle version RETURNING jsonb.
--
-- Le DAL mappe et valide Zod la ligne retournée, sans SELECT post-écriture
-- (ADR-018). Ferme TK-09b.
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : DROP IF EXISTS + CREATE OR REPLACE.
-- =============================================================================

DROP FUNCTION IF EXISTS update_sejour_with_participants(uuid, text, date, integer, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION update_sejour_with_participants(
  p_id                uuid,
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
  v_token     text;
  v_cree_le   timestamptz;
  v_parts_out jsonb;
BEGIN
  UPDATE sejours
  SET
    nom               = p_nom,
    date_debut        = p_date_debut,
    nb_jours          = p_nb_jours,
    repartition_repas = p_repartition_repas,
    parametres        = p_parametres
  WHERE id = p_id
  RETURNING token, cree_le INTO v_token, v_cree_le;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sejour % introuvable', p_id;
  END IF;

  DELETE FROM participants
  WHERE sejour_id = p_id;

  INSERT INTO participants (sejour_id, nom, allergies, exclusions, aime, n_aime_pas)
  SELECT
    p_id,
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
  WHERE sejour_id = p_id;

  RETURN jsonb_build_object(
    'id',                p_id,
    'token',             v_token,
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
