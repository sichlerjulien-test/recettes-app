# ADR-003 — Schéma Supabase, RLS et stratégie de seed

**Statut** : Accepté
**Date** : 2026-04-26
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

Le MVP a besoin d'une persistance pour :
- Le catalogue d'ingrédients et de recettes (read-only en prod, alimenté
  depuis les YAML curés)
- Les séjours créés par les utilisateurs
- Les participants liés aux séjours
- Les plannings générés par le LLM

Pas d'authentification au MVP : un séjour est identifié par un token
unique partagé via URL.

Choix technique stack : Supabase (Postgres managé) déjà acté en Phase 1
de cadrage. Cet ADR documente les choix de schéma, de Row Level Security,
et de stratégie de seed/build.

## Décision

### Schéma de tables

6 tables :

| Table | Rôle | Mode |
|---|---|---|
| ingredients | Catalogue ingrédients (50 lignes) | Read-only |
| recettes | Catalogue recettes (10 lignes) | Read-only |
| recette_ingredients | Liaison N-N recettes ↔ ingredients | Read-only |
| sejours | Séjours créés par utilisateurs | Read-write |
| participants | Participants liés à un séjour | Read-write |
| plannings | Plannings générés par le LLM | Read-write |

### Stratégie d'identifiants

- **ingredients.id** et **recettes.id** : slug texte (PK)
  - Cohérent avec les YAML curés
  - Lisible dans les requêtes et les logs
  - Stabilité par construction (pas de risque de réécriture)

- **sejours.id**, **participants.id**, **plannings.id** : UUID v4 (PK)
  - Générés par Postgres (gen_random_uuid())
  - Pas de besoin de lisibilité pour ces entités
  - Évite les collisions inter-utilisateurs

### Stockage des champs calculés

Les champs allergenes_calcules, est_vegetarien, est_vegan des recettes
sont CALCULÉS au build (computeRecipeMetadata) et STOCKÉS en base.

Justifications :
- Performance : pas de recalcul ni de jointure massive à chaque génération
  de planning
- Cohérence : le snapshot DB reflète exactement ce qui a été buildé
- Simplicité front : pas de logique de calcul dupliquée côté client
- Trade-off : risque de désynchronisation si la base recettes évolue sans
  rebuild → mitigé par un script build-data idempotent et obligatoire

Les paramètres de séjour sont stockés sous forme JSONB pour aligner le
schéma SQL sur les types Zod (`repartition_repas`, `parametres`).
Avantage : pas de mapping colonne ↔ champ objet dans les routes API.

### Row Level Security (RLS)

Au MVP (pas d'authentification) :

- **ingredients, recettes, recette_ingredients** : RLS DÉSACTIVÉ
  - Read-only public, pas de risque
  - Évite la complexité inutile

- **sejours, participants, plannings** : RLS ACTIVÉ avec policy permissive
  "anyone can read/write" pour le MVP
  - Permet de tester rapidement
  - Sera durci au Sprint 1 avec une vraie auth ou une policy basée
    sur le token de séjour

### Stratégie de seed et build

Deux artefacts distincts :

- **scripts/migrations/001-initial-schema.sql** : crée le schéma initial
  (tables, contraintes, RLS policies). Idempotent.
  Au MVP : appliqué manuellement via le SQL Editor de Supabase → Run.
  Migration via CLI Supabase à envisager au Sprint 1.

- **scripts/build-data.ts** : lit les YAML de data/, calcule les
  champs dérivés via computeRecipeMetadata, et UPSERT dans Supabase.
  Idempotent (peut être relancé sans casser les données existantes).
  Limite connue : le DELETE + INSERT sur recette_ingredients est non
  transactionnel. En cas d'échec partiel, relancer le script suffit.

Les deux artefacts utilisent SUPABASE_SERVICE_ROLE_KEY (bypass RLS), jamais
exécutés côté client.

## Conséquences

### Positives
- Schéma cohérent avec le modèle TypeScript (Recette, Ingredient, etc.)
- Slugs lisibles dans la DB facilitent debug et requêtes manuelles
- Champs calculés stockés = perf et simplicité
- RLS prêt à être durci sans refonte schéma

### Négatives
- Risque de désynchronisation si on oublie de relancer build-data après
  modification YAML → mitigé par CI à venir
- RLS permissive au MVP = pas de protection contre un attaquant qui
  devine un UUID de séjour → acceptable pour un MVP test interne, à
  durcir avant ouverture publique

### Neutres
- Pas d'ORM (pas de Drizzle, Prisma, Kysely) pour le MVP
  - @supabase/supabase-js suffit pour la simplicité actuelle
  - À reconsidérer si la complexité des requêtes augmente

## Choix de Supabase vs alternatives

Supabase a été retenu plutôt que Neon, Railway, Convex ou Firebase pour :
- **Postgres standard** : pas de vendor-lock sur le modèle de données
- **RLS native** : isolation multi-utilisateur sans couche applicative
- **Gratuit pour le MVP** : free tier suffisant pour 10 recettes + séjours de test
- **Dashboard inclus** : SQL Editor, Table Editor, Logs sans outillage additionnel
- **Auth ready** : module Supabase Auth réutilisable au Sprint 1 sans migration

## Pattern de connexion côté app (à venir)

À documenter en Session UI ou Session 7 lors de l'implémentation de la
première route API. Pistes à explorer :
- `@supabase/ssr` pour Next.js 16 (cookie-based session management)
- Client singleton côté serveur (`createServerClient`)
- Gestion SSR vs CSR : ne jamais exposer SUPABASE_SERVICE_ROLE_KEY au client

## Alternatives écartées

### Alternative A — UUIDs partout (incluant ingredients et recettes)
Plus uniforme mais perd la lisibilité des slugs. Pas de bénéfice clair
pour le MVP.

### Alternative B — Pas de stockage des champs calculés (calcul à la volée)
Économise du stockage négligeable, ajoute latence et complexité. Refusé.

### Alternative C — RLS strict dès le MVP avec auth Supabase
Auth est un module complet (signup, login, magic link, etc.) hors-scope
MVP. La promesse produit est "zero friction" - un séjour = une URL
partageable. Auth viendra au Sprint 1.

### Alternative D — ORM (Drizzle ou Prisma)
Pour un MVP avec 6 tables et des requêtes simples, l'ORM ajoute du
code, du build step, et de la dépendance pour zéro bénéfice. À
reconsidérer si on dépasse 15 tables ou si les requêtes deviennent
complexes.

## Critères de revue

Cette décision sera réévaluée si :
- Le projet ajoute une vraie authentification (rendre RLS strict)
- La complexité des requêtes justifie un ORM
- Un besoin de performance impose des index ou de la dénormalisation

## Références
- ADR-001 : architecture validation allergènes
- ADR-002 : Zod source unique de vérité
- Supabase docs : https://supabase.com/docs/guides/auth/row-level-security
