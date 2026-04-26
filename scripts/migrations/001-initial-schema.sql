-- =============================================================================
-- 001-initial-schema.sql
-- Schéma initial Supabase pour le projet Meal Planner.
--
-- Exécution : copier-coller dans le SQL Editor de Supabase → Run
-- Ce fichier est IDEMPOTENT : peut être relancé sans erreur ni perte de données.
--
-- Tables créées (6) :
--   Catalogue (RLS off) : ingredients, recettes, recette_ingredients
--   Utilisateurs (RLS on) : sejours, participants, plannings
--
-- Correspondance ADR-003 :
--   - Slugs texte comme PK pour le catalogue (lisibilité, cohérence YAML)
--   - UUID v4 pour les entités utilisateur (gen_random_uuid())
--   - RLS permissif MVP sur sejours/participants/plannings (durci au Sprint 1)
-- =============================================================================


-- =============================================================================
-- SECTION 1 — FONCTION TRIGGER updated_at
-- Partagée par ingredients et recettes.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- SECTION 2 — TABLE : ingredients
-- Catalogue des ingrédients. PK = slug texte (cohérent avec les YAML).
-- RLS désactivé : catalogue public en lecture seule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ingredients (
  id              text        PRIMARY KEY,  -- slug (ex : "huile-olive")
  nom             text        NOT NULL,
  nom_pluriel     text        NOT NULL,
  categorie       text        NOT NULL CHECK (categorie IN (
                    'fruits-legumes', 'viandes-poissons', 'cremerie-oeufs',
                    'epicerie-salee', 'epicerie-sucree', 'feculents-pates-riz',
                    'boulangerie', 'surgele', 'boissons', 'condiments-epices',
                    'frais-traiteur'
                  )),
  unite_base      text        NOT NULL CHECK (unite_base IN ('g', 'ml', 'piece')),
  unite_achat     text        NOT NULL CHECK (unite_achat IN (
                    'g', 'kg', 'ml', 'l', 'piece',
                    'botte', 'sachet', 'cuillere-soupe', 'cuillere-cafe'
                  )),
  conversion      numeric     NOT NULL CHECK (conversion > 0),
  allergenes      text[]      NOT NULL DEFAULT '{}',
  contient_trace  text[]      NOT NULL DEFAULT '{}',
  substituts      text[]      NOT NULL DEFAULT '{}',
  saisonnalite    integer[],            -- nullable ; valeurs : 1-12
  notes           text,                -- nullable
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ingredients_updated_at ON ingredients;
CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_ingredients_categorie ON ingredients (categorie);

-- RLS
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 3 — TABLE : recettes
-- Catalogue des recettes. PK = slug texte.
-- Champs allergenes_calcules, est_vegetarien, est_vegan : calculés au build
-- par computeRecipeMetadata et stockés ici (ADR-003 §Stockage des champs calculés).
-- RLS désactivé : catalogue public en lecture seule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS recettes (
  id                    text        PRIMARY KEY,  -- slug (ex : "poulet-basquaise")
  nom                   text        NOT NULL,
  description           text        NOT NULL,
  portions_base         integer     NOT NULL CHECK (portions_base > 0 AND portions_base <= 20),
  duree_minutes         integer     NOT NULL CHECK (duree_minutes > 0),
  duree_active          integer     NOT NULL CHECK (duree_active >= 0),
  difficulte            text        NOT NULL CHECK (difficulte IN ('facile', 'normale')),
  equipement            text[]      NOT NULL CHECK (cardinality(equipement) > 0),
  type_repas            text[]      NOT NULL CHECK (cardinality(type_repas) > 0),
  type_cuisine          text        NOT NULL CHECK (type_cuisine IN (
                          'francaise', 'italienne', 'asiatique', 'mexicaine',
                          'mediterraneenne', 'orientale', 'neutre'
                        )),
  saison                text[]      NOT NULL CHECK (cardinality(saison) > 0),
  ingredient_principal  text        NOT NULL CHECK (ingredient_principal IN (
                          'poulet', 'boeuf', 'porc', 'agneau', 'poisson',
                          'fruits-de-mer', 'oeufs', 'legumineuses', 'fromage',
                          'tofu', 'legumes'
                        )),
  feculent_dominant     text        NOT NULL CHECK (feculent_dominant IN (
                          'pates', 'riz', 'pommes-de-terre', 'pain',
                          'semoule', 'quinoa', 'aucun'
                        )),
  etapes                text[]      NOT NULL CHECK (cardinality(etapes) > 0),
  tags_libres           text[]      NOT NULL DEFAULT '{}',
  allergenes_calcules   text[]      NOT NULL DEFAULT '{}',  -- calculé au build
  est_vegetarien        boolean     NOT NULL,               -- calculé au build
  est_vegan             boolean     NOT NULL,               -- calculé au build
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT duree_active_lte_minutes CHECK (duree_active <= duree_minutes)
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_recettes_updated_at ON recettes;
CREATE TRIGGER trg_recettes_updated_at
  BEFORE UPDATE ON recettes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE recettes DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 4 — TABLE : recette_ingredients
-- Table de liaison N-N recettes ↔ ingredients.
-- `position` préserve l'ordre des ingrédients dans la recette et permet
-- au même ingrédient d'apparaître dans plusieurs groupes (ex : sauce + base).
-- PK composite : (recette_id, ingredient_id, position).
-- RLS désactivé : catalogue public en lecture seule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS recette_ingredients (
  recette_id      text        NOT NULL REFERENCES recettes(id)     ON DELETE CASCADE,
  ingredient_id   text        NOT NULL REFERENCES ingredients(id)  ON DELETE RESTRICT,
  quantite_base   numeric     NOT NULL CHECK (quantite_base > 0),
  unite           text        NOT NULL CHECK (unite IN (
                    'g', 'kg', 'ml', 'l', 'piece',
                    'botte', 'sachet', 'cuillere-soupe', 'cuillere-cafe'
                  )),
  optionnel       boolean     NOT NULL DEFAULT false,
  groupe          text,                -- nullable (ex : "sauce", "marinade")
  position        integer     NOT NULL, -- ordre d'affichage dans la recette

  PRIMARY KEY (recette_id, ingredient_id, position)
);

-- Index pour requêtes inverses (ex : "quelles recettes utilisent cet ingrédient ?")
CREATE INDEX IF NOT EXISTS idx_recette_ingredients_ingredient_id
  ON recette_ingredients (ingredient_id);

-- RLS
ALTER TABLE recette_ingredients DISABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 5 — TABLE : sejours
-- Séjours créés par les utilisateurs. PK = UUID généré par Postgres.
-- `token` sert d'auth implicite pour le partage URL (MVP sans auth).
-- RLS activé avec policy permissive MVP.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sejours (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token                     text        NOT NULL UNIQUE,  -- partage URL, auth implicite MVP
  nom                       text        NOT NULL,
  date_debut                date,                         -- nullable
  nb_jours                  integer     NOT NULL CHECK (nb_jours >= 1 AND nb_jours <= 7),
  repartition_midis         integer     NOT NULL DEFAULT 0 CHECK (repartition_midis >= 0),
  repartition_soirs         integer     NOT NULL DEFAULT 0 CHECK (repartition_soirs >= 0),
  repartition_brunchs       integer     NOT NULL DEFAULT 0 CHECK (repartition_brunchs >= 0),
  niveau_cuisine            text        NOT NULL CHECK (niveau_cuisine IN ('facile', 'normal')),
  equipement_disponible     text[]      NOT NULL CHECK (cardinality(equipement_disponible) > 0),
  temps_disponible          text        NOT NULL CHECK (temps_disponible IN ('rapide', 'standard')),
  cree_le                   timestamptz NOT NULL DEFAULT now(),

  -- Au moins un type de repas doit être planifié sur le séjour
  CONSTRAINT au_moins_un_repas CHECK (
    repartition_midis + repartition_soirs + repartition_brunchs > 0
  )
);

-- RLS activé — policy permissive MVP (sera durcie au Sprint 1 avec auth token)
ALTER TABLE sejours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_mvp ON sejours;
CREATE POLICY allow_all_mvp ON sejours
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 6 — TABLE : participants
-- Participants liés à un séjour. PK = UUID.
-- Contraintes allergènes et régimes stockées ici pour la génération de planning.
-- RLS activé avec policy permissive MVP.
-- =============================================================================

CREATE TABLE IF NOT EXISTS participants (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  sejour_id   uuid    NOT NULL REFERENCES sejours(id) ON DELETE CASCADE,
  nom         text    NOT NULL,
  allergies   text[]  NOT NULL DEFAULT '{}',
  regimes     text[]  NOT NULL DEFAULT '{}',
  aime        text[]  NOT NULL DEFAULT '{}',
  n_aime_pas  text[]  NOT NULL DEFAULT '{}'
);

-- Index pour charger tous les participants d'un séjour en une requête
CREATE INDEX IF NOT EXISTS idx_participants_sejour_id ON participants (sejour_id);

-- RLS activé — policy permissive MVP (sera durcie au Sprint 1 avec auth token)
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_mvp ON participants;
CREATE POLICY allow_all_mvp ON participants
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 7 — TABLE : plannings
-- Plannings générés par le LLM pour un séjour. PK = UUID.
-- `entries` : liste de PlanningEntry (jour, repas, recette_id, portions).
-- `contraintes_utilisees` : audit des contraintes passées au LLM.
-- RLS activé avec policy permissive MVP.
-- =============================================================================

CREATE TABLE IF NOT EXISTS plannings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sejour_id             uuid        NOT NULL REFERENCES sejours(id) ON DELETE CASCADE,
  entries               jsonb       NOT NULL,  -- PlanningEntry[]
  contraintes_utilisees jsonb       NOT NULL,  -- { allergenes, regimes, equipement }
  genere_le             timestamptz NOT NULL DEFAULT now()
);

-- Index pour charger tous les plannings d'un séjour
CREATE INDEX IF NOT EXISTS idx_plannings_sejour_id ON plannings (sejour_id);

-- RLS activé — policy permissive MVP (sera durcie au Sprint 1 avec auth token)
ALTER TABLE plannings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_mvp ON plannings;
CREATE POLICY allow_all_mvp ON plannings
  FOR ALL
  USING (true)
  WITH CHECK (true);
