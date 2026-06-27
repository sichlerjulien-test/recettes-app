# ADR-015 — Source unique enum Zod ↔ CHECK SQL : gate CI d'appartenance (TK-13)

**Statut** : Accepté — fork tranché (gate CI statique membership-only, forme read-contract-gate).
**Date** : 2026-06-27
**Auteur** : Équipe Meal Planner
**Lié à** : clôt le Trou A (investigation TK-07, ADR-008) · jumeau de ADR-014 §4
            (read-contract-gate) · s'appuie sur ADR-013 (canonical.sql comme oracle)
            · cousin de TK-20, TK-32

## Contexte

Trou A (ADR-008) : `validate-data` (Zod) et les CHECK SQL sont deux calques maintenus
à la main qui dérivent indépendamment. Une valeur peut passer la CI (Zod tolère) et
casser au seed (le CHECK refuse). Vécu sur TK-07.

### Le fork que la formulation backlog masquait — et pourquoi il est faux

Le backlog pose « génération vs assertion runtime », en justifiant l'assertion par sa
couverture de la cardinalité (« le cas equipement »). Deux faits invalident cet axe :

- **La contrainte equipement n'existe plus.** Migration 005 a supprimé
  `recettes_equipement_check`. Le seul CHECK non-membership qui contredisait Zod a été
  réconcilié par suppression. La dérive résiduelle est exclusivement sur des CHECK
  d'APPARTENANCE (`col IN (...)`).
- **Sous ADR-008 + ADR-013, les deux branches convergent.** La génération-qui-applique
  est impossible (migrations immuables, application manuelle). L'assertion au seed est
  strictement dominée par un gate CI (crie plus tôt). Les deux se réduisent au même
  livrable : un gate statique enum Zod ⊆⊇ liste IN(...) de canonical.sql.

## Décision

### 1 — Gate CI statique, jumeau de read-contract-gate
Un script `scripts/check-enum-checks.ts` parse les CHECK d'appartenance de
`schema/canonical.sql` et, pour chaque paire (enum Zod ↔ table.colonne) d'un registre
explicite, asserte l'ÉGALITÉ d'ensembles entre les valeurs Zod et la liste SQL.
Écart (valeur d'un côté absente de l'autre, dans les deux sens) → exit 1 nommant la
colonne et chaque valeur divergente. Job CI `enum-check-gate` (granularité Rulesets,
ADR-010 §2). Vert sur l'état apparié actuel.

### 2 — canonical.sql comme oracle, pas la migration brute
On confronte Zod au schéma canonique régénéré (ADR-013), pas au texte d'une migration.
Cohérent avec read-contract-gate et le gate schema-replay. Aucune lecture runtime de la
DB, aucune introspection : pur statique en CI.

### 3 — Périmètre : CHECK d'appartenance scalaires uniquement
Minimum obligatoire : `recettes.ingredient_principal` et `recettes.type_cuisine` (les deux
qui ont effectivement dérivé). Étendu à TOUTE colonne scalaire portant un CHECK
d'appartenance avec contrepartie Zod présente dans canonical.sql (candidats à confirmer :
`recettes.difficulte`, `recettes.feculent_dominant`, `ingredients.categorie`,
`recette_ingredients.unite`).

**Hors périmètre** :
- CHECK de cardinalité / plage / inter-colonnes : aucune contrepartie « enum » Zod à
  confronter, et le seul cas vécu (equipement) est supprimé. La correction *forme* du CHECK
  vs la migration est déjà gardée systémiquement par ADR-013 (replay == canonical).
- CHECK d'appartenance sur colonnes TABLEAU (`equipement`, `type_repas`, `saison`) : in-scope
  SEULEMENT si présents dans canonical.sql ET parseables au même coût que le cas scalaire.
  Sinon, une ligne de backlog, pas un élargissement du ticket.

### 4 — Pas de génération de SQL, pas de scaffold de migration
Émettre un fichier migration depuis les enums Zod est écarté : collision frontale avec
l'immuabilité + application manuelle d'ADR-008. Le gate impose la convergence ; il ne la
fabrique pas. « Structurellement impossible » au sens fort est inatteignable sous ADR-008 ;
« détecté en CI avant le seed, dans les deux sens » est l'objectif réel et suffisant.

## Conséquences

Positives : le Trou A est fermé pour les enums d'appartenance — une dérive Zod↔CHECK
devient rouge en CI, plus jamais au seed. Réutilise un pattern éprouvé (read-contract-gate),
risque d'implémentation faible. Aucune dette runtime (statique pur).
Coût : un registre `enum-contract` à maintenir (toute nouvelle paire enum↔CHECK doit y
entrer) ; un parseur de la forme pg_dump du CHECK (`= ANY (ARRAY[...])`, pas le `IN(...)`
hand-written). Un job CI de plus.
Risque : si l'inventaire des CHECK de canonical.sql révèle un CHECK non-membership
contredisant une règle Zod (improbable, 005 a tué le seul connu), STOP / retour Project —
ce serait un fork distinct, pas un élargissement.

## Alternatives écartées
- **Génération-qui-applique le SQL** : impossible sous ADR-008 (immuabilité, application
  manuelle). Rejetée.
- **Assertion au seed / runtime** : strictement dominée par un gate CI (crie plus tard ;
  le seed échoue déjà). Rejetée.
- **Moteur d'assertion de CHECK arbitraires** : sur-ingénierie motivée par une contrainte
  (equipement) supprimée en 005. Type/cardinalité déjà couverts par ADR-013. Rejetée.

## Références
- ADR-008 (discipline migration immuable/manuelle), ADR-010 (gate CI multi-jobs),
  ADR-013 (canonical.sql oracle, replay), ADR-014 §4 (read-contract-gate, pattern jumeau).
- scripts/check-read-contract.ts, src/lib/db/read-contract.ts (précédent direct).
- scripts/migrations/005 (suppression equipement_check), src/lib/types/schemas.ts (enums).
- TK-07 (Trou A vécu), TK-32 (garde read-contract↔DAL, même famille de gardes statiques).
