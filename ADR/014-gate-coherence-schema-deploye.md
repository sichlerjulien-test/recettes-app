# ADR-014 — Gate de cohérence schéma déployé ↔ attentes du code (TK-16)

**Statut** : Accepté — fork tranché (contrôle cible-vive, forme runtime B1).
**Date** : 2026-06-27
**Auteur** : Équipe Meal Planner
**Lié à** : clôt la couche runtime laissée ouverte par ADR-013 · cousin de TK-13 ·
            réaffirme la discipline manuelle d'ADR-008 · s'appuie sur ADR-006 (DbError)

## Contexte

ADR-013 a fermé la couche systémique : `replay 001→N == canonical.sql`, prouvé en CI.
Reste la couche runtime de l'incident 500 /shopping-list : du code exigeant une colonne
peut être déployé sur Vercel avant que la migration correspondante soit appliquée à prod
(application manuelle, ADR-008). canonical.sql affirme que la colonne existe ; prod ne l'a
pas encore. La fenêtre de timing entre deploy code et application migration n'est vue par
aucun mécanisme actuel.

### Le fork que la formulation backlog masquait

« Au déploiement (ou en CI) » recouvre deux modèles à couverture disjointe :
- A — statique : contrat de lecture ⊆ canonical.sql. Aveugle au décalage d'ordonnancement
  qui A CAUSÉ l'incident (canonical était conforme pendant tout l'incident).
- B — cible vive : contrat de lecture ⊆ live(cible). Ferme l'incident réel.

Shipper A seul fabriquerait une fausse confiance. Donc B est obligatoire.

## Décision

### 1 — Contrôle cible-vive, obligatoire
Le gate confronte le contrat de lecture DB au schéma RÉELLEMENT déployé, pas à canonical.sql.

### 2 — Forme : assertion runtime mémoïsée (B1), pas gate pré-deploy (B2)
Un guard au bord du DAL introspecte la DB connectée au plus une fois par instance chaude.
Sur dérive (colonne requise absente) : retourne un DbError typé `schema_drift` nommant
table + colonne. Les routes concernées répondent 503 explicite, jamais un 500 opaque ni
un payload vide. Aligné sur ADR-006 (« échouer tôt et bruyamment »).

**Périmètre du check runtime** : existence des colonnes uniquement. Type et nullabilité
sont couverts systémiquement par ADR-013 (replay CI canonical.sql) et ne sont pas
re-checkés au runtime via RPC/introspection — ce serait redondant et coûteux. Le guard
détecte la fenêtre de timing entre deploy code et application migration manuelle (ADR-008) ;
il ne remplace pas la validation Zod qui reste en charge de la forme métier.

**Throw row-level — arbitrage (a)** : `requireExclusionsCompatibles` peut lancer si la
colonne `exclusions_compatibles` est null (migration appliquée mais `build-data` pas encore
tourné). Le DAL encapsule ce throw dans un `try/catch` et retourne
`{ kind: 'row_validation_failed' }` (ADR-006), jamais un throw non capturé. Les routes
mappent ce variant vers HTTP 503 au même titre que `schema_drift`.

**Hors périmètre** : `getSupabaseClient` et son throw sur variables d'environnement
manquantes restent inchangés — c'est un problème de configuration boot, pas de schéma,
traité dans un ticket séparé (TK-XX config-boot).

B2 (bloquer la promotion Vercel sur un check prod) est écarté : collision avec l'auto-deploy
Vercel Hobby et la discipline manuelle dev→prod d'ADR-008, pour un coût L/XL injustifié à
l'échelle du produit. B3 (check manuel dans MIGRATIONS.md) écarté : retour à la vigilance
humaine qu'ADR-010/013 ont supprimée.

### 3 — Source du contrat de lecture : le bord DB, pas RecetteSchema
Ce qui a throw, c'est `requireExclusionsCompatibles` sur une ligne brute, pas RecetteSchema
(forme post-mapping, champs calculés inclus). Le contrat vérifié est la forme de ligne que
le DAL attend AVANT mapping. Un naïf « introspecter RecetteSchema » serait faux.

### 4 — Modèle A en bonus conditionnel, jamais en substitut
Un job CI statique (contrat ⊆ canonical.sql) attrape une classe distincte — colonne requise
sans migration — et n'est ajouté que s'il réutilise l'extraction du guard sans surcoût.
Il ne dispense jamais de §1.

## Conséquences

Positives : la fenêtre de timing résiduelle post-ADR-013 devient détectée et diagnostiquée ;
couverture de tous les schémas de lecture en un point ; échec légible en une ligne de log.
Coût : une introspection par instance chaude (mémoïsée, négligeable) ; deux variants DbError
(`schema_drift`, `row_validation_failed` — ce dernier existait déjà) ; un contrat de lecture
`read-contract.ts` à maintenir manuellement ; `dbErrorToResponse` doit couvrir les deux
variants → 503 avec diagnostic (TypeScript enforce l'exhaustivité).
Risque : si B2 redevenait exigé, STOP / retour Project (effort gonfle d'un cran).

### Décisions réaffirmées lors de l'implémentation TK-16

- **Arbitrage (a)** : le DAL honore ADR-006 (Result) — le throw de `requireExclusionsCompatibles`
  est intercepté dans `recettes.ts` ; `getSupabaseClient` reste hors périmètre.
- **Type/nullabilité** non re-checkés au runtime (§2 ci-dessus) : évite RPC ou migration
  redondante, cohérent avec ADR-013 qui couvre déjà cette couche statiquement.

## Alternatives écartées
- A seul : vert pendant l'incident qu'il prétend prévenir. Rejeté.
- B2 : friction stack disproportionnée. Rejeté.
- B3 : régression vers la vigilance manuelle. Rejeté.

## Références
- ADR-006 (contrat DbError), ADR-008 (discipline migration manuelle), ADR-013 (couche
  systémique), docs/incidents/500-shopping-list.md, scripts/introspect-schema.sql (section COL)
