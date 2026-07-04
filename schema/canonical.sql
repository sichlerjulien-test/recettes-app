--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;

ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: create_sejour_with_participants(text, text, date, integer, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_sejour_with_participants(p_token text, p_nom text, p_date_debut date, p_nb_jours integer, p_repartition_repas jsonb, p_parametres jsonb, p_participants jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.create_sejour_with_participants(p_token text, p_nom text, p_date_debut date, p_nb_jours integer, p_repartition_repas jsonb, p_parametres jsonb, p_participants jsonb) OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- Name: update_sejour_with_participants(uuid, text, date, integer, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_sejour_with_participants(p_id uuid, p_nom text, p_date_debut date, p_nb_jours integer, p_repartition_repas jsonb, p_parametres jsonb, p_participants jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

ALTER FUNCTION public.update_sejour_with_participants(p_id uuid, p_nom text, p_date_debut date, p_nb_jours integer, p_repartition_repas jsonb, p_parametres jsonb, p_participants jsonb) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sejour_id uuid NOT NULL,
    planning_id text NOT NULL,
    jour integer NOT NULL,
    recette_id text NOT NULL,
    repas text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_jour_check CHECK ((jour > 0)),
    CONSTRAINT feedback_repas_check CHECK ((repas = ANY (ARRAY['midi'::text, 'soir'::text, 'petit-dejeuner'::text])))
);

ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ingredients (
    id text NOT NULL,
    nom_singulier text NOT NULL,
    nom_pluriel text NOT NULL,
    categorie text NOT NULL,
    unite_base text NOT NULL,
    unite_achat text NOT NULL,
    conversion numeric NOT NULL,
    allergenes text[] DEFAULT '{}'::text[] NOT NULL,
    contient_trace text[] DEFAULT '{}'::text[] NOT NULL,
    substituts text[] DEFAULT '{}'::text[] NOT NULL,
    saisonnalite integer[],
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingredients_categorie_check CHECK ((categorie = ANY (ARRAY['fruits-legumes'::text, 'viandes-poissons'::text, 'cremerie-oeufs'::text, 'epicerie-salee'::text, 'epicerie-sucree'::text, 'feculents-pates-riz'::text, 'boulangerie'::text, 'surgele'::text, 'boissons'::text, 'condiments-epices'::text, 'frais-traiteur'::text]))),
    CONSTRAINT ingredients_conversion_check CHECK ((conversion > (0)::numeric)),
    CONSTRAINT ingredients_unite_achat_check CHECK ((unite_achat = ANY (ARRAY['g'::text, 'kg'::text, 'ml'::text, 'l'::text, 'piece'::text, 'botte'::text, 'sachet'::text, 'cuillere-soupe'::text, 'cuillere-cafe'::text]))),
    CONSTRAINT ingredients_unite_base_check CHECK ((unite_base = ANY (ARRAY['g'::text, 'ml'::text, 'piece'::text])))
);

ALTER TABLE public.ingredients OWNER TO postgres;

--
-- Name: participants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sejour_id uuid NOT NULL,
    nom text NOT NULL,
    allergies text[] DEFAULT '{}'::text[] NOT NULL,
    exclusions text[] DEFAULT '{}'::text[] NOT NULL,
    aime text[] DEFAULT '{}'::text[] NOT NULL,
    n_aime_pas text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT participants_exclusions_valid CHECK ((exclusions <@ ARRAY['sans-viande-rouge'::text, 'sans-porc'::text, 'sans-poisson'::text, 'sans-fruits-de-mer'::text, 'sans-alcool'::text, 'vegetarien'::text, 'vegan'::text]))
);

ALTER TABLE public.participants OWNER TO postgres;

--
-- Name: plannings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plannings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sejour_id uuid NOT NULL,
    entries jsonb NOT NULL,
    contraintes_utilisees jsonb NOT NULL,
    genere_le timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plannings OWNER TO postgres;

--
-- Name: recette_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recette_ingredients (
    recette_id text NOT NULL,
    ingredient_id text NOT NULL,
    quantite_base numeric NOT NULL,
    unite text NOT NULL,
    optionnel boolean DEFAULT false NOT NULL,
    groupe text,
    "position" integer NOT NULL,
    CONSTRAINT recette_ingredients_quantite_base_check CHECK ((quantite_base > (0)::numeric)),
    CONSTRAINT recette_ingredients_unite_check CHECK ((unite = ANY (ARRAY['g'::text, 'kg'::text, 'ml'::text, 'l'::text, 'piece'::text, 'botte'::text, 'sachet'::text, 'cuillere-soupe'::text, 'cuillere-cafe'::text])))
);

ALTER TABLE public.recette_ingredients OWNER TO postgres;

--
-- Name: recettes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recettes (
    id text NOT NULL,
    nom text NOT NULL,
    description text NOT NULL,
    portions_base integer NOT NULL,
    duree_minutes integer NOT NULL,
    duree_active integer NOT NULL,
    difficulte text NOT NULL,
    equipement text[] NOT NULL,
    type_repas text[] NOT NULL,
    type_cuisine text NOT NULL,
    saison text[] NOT NULL,
    ingredient_principal text NOT NULL,
    feculent_dominant text NOT NULL,
    etapes text[] NOT NULL,
    tags_libres text[] DEFAULT '{}'::text[] NOT NULL,
    allergenes_calcules text[] DEFAULT '{}'::text[] NOT NULL,
    est_vegetarien boolean NOT NULL,
    est_vegan boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exclusions_compatibles text[],
    CONSTRAINT duree_active_lte_minutes CHECK ((duree_active <= duree_minutes)),
    CONSTRAINT recettes_difficulte_check CHECK ((difficulte = ANY (ARRAY['facile'::text, 'normale'::text]))),
    CONSTRAINT recettes_duree_active_check CHECK ((duree_active >= 0)),
    CONSTRAINT recettes_duree_minutes_check CHECK ((duree_minutes > 0)),
    CONSTRAINT recettes_etapes_check CHECK ((cardinality(etapes) > 0)),
    CONSTRAINT recettes_feculent_dominant_check CHECK ((feculent_dominant = ANY (ARRAY['pates'::text, 'riz'::text, 'pommes-de-terre'::text, 'pain'::text, 'semoule'::text, 'quinoa'::text, 'aucun'::text]))),
    CONSTRAINT recettes_ingredient_principal_check CHECK ((ingredient_principal = ANY (ARRAY['poulet'::text, 'boeuf'::text, 'porc'::text, 'agneau'::text, 'poisson'::text, 'fruits-de-mer'::text, 'oeufs'::text, 'legumineuses'::text, 'fromage'::text, 'tofu'::text, 'legumes'::text, 'fruits'::text, 'pain'::text]))),
    CONSTRAINT recettes_portions_base_check CHECK (((portions_base > 0) AND (portions_base <= 20))),
    CONSTRAINT recettes_saison_check CHECK ((cardinality(saison) > 0)),
    CONSTRAINT recettes_type_cuisine_check CHECK ((type_cuisine = ANY (ARRAY['francaise'::text, 'italienne'::text, 'asiatique'::text, 'mexicaine'::text, 'mediterraneenne'::text, 'orientale'::text, 'neutre'::text, 'americaine'::text, 'anglaise'::text]))),
    CONSTRAINT recettes_type_repas_check CHECK ((cardinality(type_repas) > 0))
);

ALTER TABLE public.recettes OWNER TO postgres;

--
-- Name: sejours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sejours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    nom text NOT NULL,
    date_debut date,
    nb_jours integer NOT NULL,
    repartition_repas jsonb NOT NULL,
    parametres jsonb NOT NULL,
    cree_le timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT au_moins_un_repas CHECK ((((((repartition_repas ->> 'midis'::text))::integer + ((repartition_repas ->> 'soirs'::text))::integer) + ((repartition_repas ->> 'brunchs'::text))::integer) > 0)),
    CONSTRAINT equipement_non_vide CHECK ((jsonb_array_length((parametres -> 'equipement_disponible'::text)) > 0)),
    CONSTRAINT niveau_cuisine_valid CHECK (((parametres ->> 'niveau_cuisine'::text) = ANY (ARRAY['facile'::text, 'normal'::text]))),
    CONSTRAINT repartition_brunchs_nonneg CHECK ((((repartition_repas ->> 'brunchs'::text))::integer >= 0)),
    CONSTRAINT repartition_midis_nonneg CHECK ((((repartition_repas ->> 'midis'::text))::integer >= 0)),
    CONSTRAINT repartition_soirs_nonneg CHECK ((((repartition_repas ->> 'soirs'::text))::integer >= 0)),
    CONSTRAINT sejours_nb_jours_check CHECK (((nb_jours >= 1) AND (nb_jours <= 7))),
    CONSTRAINT temps_disponible_valid CHECK (((parametres ->> 'temps_disponible'::text) = ANY (ARRAY['rapide'::text, 'standard'::text])))
);

ALTER TABLE public.sejours OWNER TO postgres;

--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);

--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);

--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);

--
-- Name: plannings plannings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plannings
    ADD CONSTRAINT plannings_pkey PRIMARY KEY (id);

--
-- Name: recette_ingredients recette_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recette_ingredients
    ADD CONSTRAINT recette_ingredients_pkey PRIMARY KEY (recette_id, ingredient_id, "position");

--
-- Name: recettes recettes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recettes
    ADD CONSTRAINT recettes_pkey PRIMARY KEY (id);

--
-- Name: sejours sejours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sejours
    ADD CONSTRAINT sejours_pkey PRIMARY KEY (id);

--
-- Name: sejours sejours_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sejours
    ADD CONSTRAINT sejours_token_key UNIQUE (token);

--
-- Name: idx_ingredients_categorie; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ingredients_categorie ON public.ingredients USING btree (categorie);

--
-- Name: idx_participants_sejour_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_participants_sejour_id ON public.participants USING btree (sejour_id);

--
-- Name: idx_plannings_sejour_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_plannings_sejour_id ON public.plannings USING btree (sejour_id);

--
-- Name: idx_recette_ingredients_ingredient_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recette_ingredients_ingredient_id ON public.recette_ingredients USING btree (ingredient_id);

--
-- Name: ingredients trg_ingredients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: recettes trg_recettes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_recettes_updated_at BEFORE UPDATE ON public.recettes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: feedback feedback_sejour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_sejour_id_fkey FOREIGN KEY (sejour_id) REFERENCES public.sejours(id) ON DELETE CASCADE;

--
-- Name: participants participants_sejour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_sejour_id_fkey FOREIGN KEY (sejour_id) REFERENCES public.sejours(id) ON DELETE CASCADE;

--
-- Name: plannings plannings_sejour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plannings
    ADD CONSTRAINT plannings_sejour_id_fkey FOREIGN KEY (sejour_id) REFERENCES public.sejours(id) ON DELETE CASCADE;

--
-- Name: recette_ingredients recette_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recette_ingredients
    ADD CONSTRAINT recette_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE RESTRICT;

--
-- Name: recette_ingredients recette_ingredients_recette_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recette_ingredients
    ADD CONSTRAINT recette_ingredients_recette_id_fkey FOREIGN KEY (recette_id) REFERENCES public.recettes(id) ON DELETE CASCADE;

--
-- Name: participants allow_all_mvp; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_all_mvp ON public.participants USING (true) WITH CHECK (true);

--
-- Name: plannings allow_all_mvp; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_all_mvp ON public.plannings USING (true) WITH CHECK (true);

--
-- Name: sejours allow_all_mvp; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY allow_all_mvp ON public.sejours USING (true) WITH CHECK (true);

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: participants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

--
-- Name: plannings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plannings ENABLE ROW LEVEL SECURITY;

--
-- Name: recette_ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recette_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: recettes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recettes ENABLE ROW LEVEL SECURITY;

--
-- Name: sejours; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.sejours ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
