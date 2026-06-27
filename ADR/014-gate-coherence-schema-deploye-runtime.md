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
Sur dérive (colonne requise absente, type ou nullabilité divergents) : retourne un DbError
typé `schema_drift` nommant table + colonne + écart. Les routes concernées répondent 503
explicite, jamais un 500 opaque ni un payload vide. Aligné sur ADR-006 (« échouer tôt et
bruyamment »).

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
Coût : une introspection par instance chaude (mémoïsée, négligeable) ; un variant DbError ;
un contrat de lecture explicite au bord DB à maintenir.
Risque : si B2 redevenait exigé, STOP / retour Project (effort gonfle d'un cran).

## Alternatives écartées
- A seul : vert pendant l'incident qu'il prétend prévenir. Rejeté.
- B2 : friction stack disproportionnée. Rejeté.
- B3 : régression vers la vigilance manuelle. Rejeté.

## Références
- ADR-006 (contrat DbError), ADR-008 (discipline migration manuelle), ADR-013 (couche
  systémique), docs/incidents/500-shopping-list.md, scripts/introspect-schema.sql (section COL)
