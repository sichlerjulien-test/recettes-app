-- =============================================================================
-- 007-rename-regimes-to-exclusions.sql
-- Renomme participants.regimes en participants.exclusions et ferme le vocabulaire.
--
-- Vocabulaire dupliqué depuis EXCLUSION_TAGS (src/lib/dietary/exclusion.ts).
-- Nouvelle instance du Trou A (SQL<->Zod) : ajouter un tag = éditer ICI + la constante.
-- À absorber par TK-13 quand il existera.
-- =============================================================================

ALTER TABLE participants RENAME COLUMN regimes TO exclusions;

ALTER TABLE participants
  ADD CONSTRAINT participants_exclusions_valid
  CHECK (exclusions <@ ARRAY[
    'sans-viande-rouge','sans-porc','sans-poisson','sans-fruits-de-mer',
    'sans-alcool','vegetarien','vegan'
  ]::text[]);

CREATE OR REPLACE FUNCTION update_sejour_with_participants(
  p_id                uuid,
  p_nom               text,
  p_date_debut        date,     -- NULL si absent
  p_nb_jours          integer,
  p_repartition_repas jsonb,
  p_parametres        jsonb,
  p_participants      jsonb     -- [{nom, allergies, exclusions, aime, n_aime_pas}]
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

  INSERT INTO participants (sejour_id, nom, allergies, exclusions, aime, n_aime_pas)
  SELECT
    p_id,
    (p ->> 'nom')::text,
    ARRAY(SELECT jsonb_array_elements_text(p -> 'allergies')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'exclusions')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'aime')),
    ARRAY(SELECT jsonb_array_elements_text(p -> 'n_aime_pas'))
  FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) AS p;
END;
$$;
