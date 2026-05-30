-- =============================================================================
-- 003-update-sejour-rpc.sql
-- Fonction transactionnelle update_sejour_with_participants.
--
-- Remplace les trois requêtes séquentielles de updateSejour() (UPDATE sejour,
-- DELETE participants, INSERT participants) par un bloc atomique :
-- si l'INSERT participants échoue, le rollback annule aussi l'UPDATE et le DELETE.
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Idempotent : CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_sejour_with_participants(
  p_id                uuid,
  p_nom               text,
  p_date_debut        date,     -- NULL si absent
  p_nb_jours          integer,
  p_repartition_repas jsonb,
  p_parametres        jsonb,
  p_participants      jsonb     -- [{nom, allergies, regimes, aime, n_aime_pas}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sejours
  SET
    nom               = p_nom,
    date_debut        = p_date_debut,
    nb_jours          = p_nb_jours,
    repartition_repas = p_repartition_repas,
    parametres        = p_parametres
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sejour % introuvable', p_id;
  END IF;

  DELETE FROM participants
  WHERE sejour_id = p_id;

  INSERT INTO participants (sejour_id, nom, allergies, regimes, aime, n_aime_pas)
  SELECT
    p_id,
    (p ->> 'nom')::text,
    ARRAY(SELECT jsonb_array_elements_text(p -> 'allergies')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'regimes')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'aime')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'n_aime_pas'))
  FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) AS p;
END;
$$;
