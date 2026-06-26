# Incident — 500 sur `/shopping-list`

**Date détectée** : entre le 2026-06-12 (merge PR #24) et aujourd'hui  
**Détection** : a posteriori, par diff `prod` vs `schema/canonical.sql` (session post-TK-15)  
**Statut** : résolu côté runtime (colonne présente en prod, matérialisée par `build-data`)

---

## Symptôme

HTTP 500 sur `POST /api/sejours/[id]/shopping-list` pour tout séjour ayant un planning.

## Cause directe

Colonne `exclusions_compatibles` (`text[]`) absente de prod au moment de la requête.

Le DAL `getAllRecettesAsMap()` appelle `mapRecetteRow()` pour chaque ligne, qui invoque
`requireExclusionsCompatibles(row['exclusions_compatibles'], row['id'])`. Cette fonction
**jette un `Error` JS** si la valeur est `null` ou `undefined` — avant même le `safeParse`
Zod. L'exception n'est pas catchée par `getAllRecettes()`, elle propage jusqu'à la route
Next.js et produit un 500 opaque.

La colonne est introduite par la migration `008-add-exclusions-compatibles.sql`, committée
dans PR #24 le 2026-06-12. Le comportement jetant (via `requireExclusionsCompatibles`) est
introduit dans le même PR par `43c0ebd` (2026-06-11 23:46). La migration n'est appliquée
qu'à la main (MIGRATIONS.md) : si elle n'a pas précédé le déploiement du code, toute requête
sur la liste de courses échoue en 500.

## Cause systémique

Aucune migration du repo ne reproduisait le schéma complet from scratch (ADR-013). La
dérive dev/prod était silencieuse : le code pouvait exiger une colonne absente de prod et
rien ne le signalait avant le 500 en production.

## Ce que la vérification post-TK-15 a établi

- `schema/canonical.sql` inclut `exclusions_compatibles text[]` sur `recettes` (ligne 193).
- Une vérification REST avec la `service_role` key confirme que la colonne est présente en
  prod et matérialisée (`["sans-viande-rouge","sans-porc",...]`). La boucle runtime est
  substantiellement fermée.
- La vérification structurelle complète (contraintes, index, triggers, FK) reste à faire via
  `pg_dump -s prod` vs `canonical.sql` dès que l'URI directe est disponible.

## Ce qui empêche la récidive

| Couche | Mécanisme | État |
|--------|-----------|------|
| Systémique | Gate CI `schema-replay` (TK-15 / ADR-013) : replay `001→N` == `canonical.sql`, bloque le merge si l'oracle dérive | **Livré** |
| Runtime | **TK-16** (À faire) : gate de déploiement garantissant `schéma déployé ⊇ attentes Zod` | **Ouvert** |

Tant que TK-16 n'est pas livré, une prochaine colonne attendue par le code peut être absente
du déploiement sans que rien ne le détecte avant le 500.

## Frise chronologique

| Date | Événement |
|------|-----------|
| 2026-04-30 | `/shopping-list` shippée — `recettes.ts` reconstruit `exclusions_compatibles` depuis `est_vegetarien`/`est_vegan`, pas de colonne DB requise |
| 2026-06-10 | TK-05 Phase 2A : `exclusions_compatibles` entre dans le schéma Zod `RecetteSchema` |
| 2026-06-11 15:07 | Commit `2b9d3a2` : migration `008` créée, `recettes.ts` lit la colonne DB — fallback `[]` si absente (safe) |
| 2026-06-11 23:46 | Commit `43c0ebd` : `requireExclusionsCompatibles` introduit — **throw si absent/null**, migration `009` créée |
| 2026-06-12 16:59 | PR #24 mergée : code jetant déployé en prod, migrations `008`/`009` en attente d'application manuelle |
| *(inconnu)* | Migrations `008`/`009` appliquées à prod — colonne créée, `build-data` matérialise les valeurs |
| 2026-06-26 | Vérification REST confirme colonne présente et matérialisée en prod |
