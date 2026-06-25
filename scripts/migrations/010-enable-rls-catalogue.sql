-- =============================================================================
-- 010-enable-rls-catalogue.sql
-- Aligne le RLS des tables catalogue avec l'état réel de la DB (Supabase active
-- le RLS sur toutes les tables par défaut, écrasant le DISABLE de 001).
--
-- Sans cette migration, le replay 001→009 sur un PostgreSQL nu produit DISABLE
-- pour ingredients/recette_ingredients/recettes, alors que la DB live a ENABLE.
-- Le gate CI (ADR-013 §4) échouerait dès le départ.
--
-- Sûre : l'app utilise la clé service_role côté serveur (contourne le RLS).
-- Pas de policy ajoutée : les tables catalogue restent en lecture via service_role.
-- Idempotente : ENABLE sur une table déjà en RLS = no-op.
-- =============================================================================

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recette_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recettes ENABLE ROW LEVEL SECURITY;
