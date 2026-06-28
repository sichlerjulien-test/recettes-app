# ADR-016 — Gate DAL read-contract unifié : un seul checker précis-en-fonction / large-hors-fonction (TK-34)

**Statut** : Accepté — fork tranché (un gate unique, granularité précise-en-fonction et large-hors-fonction).
**Date** : 2026-06-28
**Auteur** : Équipe Meal Planner
**Lié à** : absorbe et supersede les gates de TK-32 (`check-dal-read-contract`) et TK-33
            (`check-dal-reads`) · jumeau de read-contract-gate (ADR-014 §4) et de
            enum-check-gate (ADR-015) · granularité Rulesets (ADR-010 §2)

## Contexte

Deux gates CI gardent aujourd'hui la même frontière — les lectures bracket du DAL
(`row['colonne']`) doivent rester déclarées dans `READ_CONTRACT` (ADR-014 §3) :

- **`check-dal-read-contract.ts` (TK-32) — précis, étroit.** Marche uniquement sur les
  fonctions de mapping listées dans `FUNCTION_TO_TABLE` (`mapRecetteRow`,
  `mapRecetteIngredientRow`, `byPosition`, `mapIngredientRow`), dans recettes.ts +
  ingredients.ts. Pour chaque fonction, les accès sont confrontés à `READ_CONTRACT[table
  exacte de la fonction]`. Dans recettes.ts — seul fichier multi-tables (recettes +
  recette_ingredients) — un `row['x']` lu dans `mapRecetteRow` est vérifié contre
  `recettes` **seule**. Aveugle à tout accès hors des fonctions nommées, aveugle à
  plannings.ts, et `IGNORE_KEYS` / `FUNCTION_TO_TABLE` sont des listes maintenues à la main
  qui ratent en silence ce qu'on oublie d'y inscrire.

- **`check-dal-reads.ts` (TK-33) — large, lâche.** Tous les accès bracket du fichier, où
  qu'ils soient, confrontés à l'**union** des contrats des tables du fichier. Couvre
  plannings.ts, couvre les accès hors fonctions nommées, skip de join **dynamique** (toute
  clé dont le nom est lui-même une table de `READ_CONTRACT`), reporte fichier:ligne. Mais
  dans recettes.ts, `union(recettes, recette_ingredients)` masque la précision : une colonne
  de recette_ingredients lue dans `mapRecetteRow` **passe**.

### Le fork que la formulation backlog masquait — et pourquoi il est faux

Le backlog pose la décision comme « un checker vs deux », en concédant « pas acquis qu'un
> deux ». L'axe est faux : TK-32 et TK-33 n'enforce pas deux **propriétés** distinctes, ce
sont **deux implémentations partielles du même invariant**. Le split est un accident de
séquencement (TK-32 puis TK-33), pas une séparation conçue.

Deux faits ferment le fork :

- **Aucun ne domine l'autre, mais leurs angles morts sont complémentaires.** TK-32 attrape
  une classe que TK-33 rate (colonne d'une table B lue dans une fonction mappant la table A,
  dans un fichier hébergeant A et B — soit recettes.ts aujourd'hui). TK-33 attrape une classe
  que TK-32 rate (accès hors fonction nommée, et tout plannings.ts). Un check
  précis-dans-une-fonction-connue / large-sinon **domine strictement les deux** : il est la
  conjonction de leurs garanties, pas un compromis.

- **Deux gates partiels sur un invariant fabriquent une fausse confiance.** Chacun a l'air de
  garder « les lectures DAL » ; ni l'un ni l'autre ne le fait entièrement. C'est exactement
  le motif qu'ADR-014 §4 et ADR-015 ont rejeté (« shipper A seul fabriquerait une fausse
  confiance »). Le contre-argument « deux gates = échecs indépendants, messages plus clairs »
  ne vaut que pour des propriétés indépendantes ; ici un message unifié `table.colonne @
  fichier:ligne` est **plus** précis que les deux messages actuels réunis.

## Décision

### 1 — Un seul gate, un seul script
`scripts/check-dal-reads.ts` (on garde ce nom) absorbe la précision-en-fonction de
`check-dal-read-contract.ts`. Ce dernier est supprimé. Les jobs CI `dal-read-contract-gate`
et `dal-reads-gate` fusionnent en un seul job (`dal-read-contract-gate`, granularité Rulesets
ADR-010 §2). Vert sur l'état DAL actuel.

### 2 — Granularité : précis-en-fonction, large-hors-fonction
Chaque accès bracket est tagué par sa `FunctionDeclaration` englobante.
- Accès **dans** une fonction de `FUNCTION_TO_TABLE` → confronté à `READ_CONTRACT[table de
  cette fonction]` (précision TK-32).
- Accès **hors** de toute fonction connue (ou dans un fichier sans mapping fonction→table,
  ex. plannings.ts aujourd'hui) → confronté à l'union des contrats des tables du fichier
  (couverture TK-33).

### 3 — Skip de join dynamique ; fin des listes statiques rot-prone
Le skip d'artefact de jointure utilise le pattern dynamique de TK-33 (clé == nom de table
dans `READ_CONTRACT` → ignorée). `IGNORE_KEYS` (liste statique de TK-32) est supprimé.
`FUNCTION_TO_TABLE` reste — c'est la table de précision irréductible — mais devient la
**seule** surface maintenue à la main du checker, et est documentée comme telle.

### 4 — Périmètre inchangé
`READ_CONTRACT` reste la source de vérité unique (ADR-014 §3), non modifiée. La direction
inverse (colonne déclarée mais jamais lue) reste hors-scope. Le durcissement du parser
`canonical.sql` (autre lignée, note TK-33-bis) n'est pas touché.

### 5 — Préservation prouvée, pas postulée
Les assertions des deux suites de tests actuelles sont portées dans `tests/check-dal-reads.test.ts`
(`tests/check-dal-read-contract.test.ts` supprimé). Une matrice discriminante valide la fusion :
- colonne de recette_ingredients lue dans `mapRecetteRow` → **FAIL** (classe TK-32) ;
- colonne hors contrat hors fonction nommée ou dans plannings.ts → **FAIL** (classe TK-33) ;
- clé == nom de table (résultat de join) → ignorée, pas de faux positif ;
- DAL réel actuel → **0 violation**.

## Conséquences

Positives : un invariant, un gate, une garantie complète au lieu de deux partielles.
Disparition des deux listes statiques (`IGNORE_KEYS`) et de la duplication d'extraction AST
(`extractStringAccesses` ≈ `extractBracketAccesses`). plannings.ts héritera de la
précision-en-fonction **automatiquement** le jour où il deviendra multi-tables — le trou
dormant se ferme avant de s'ouvrir. Message d'échec `table.colonne @ fichier:ligne`, plus
diagnostique que l'existant.

Coût : `FUNCTION_TO_TABLE` reste maintenu à la main (une fonction de mapping ajoutée hors de
ce registre retombe sur le check large, pas le précis — dégradation gracieuse, pas un trou).
Un walk AST qui tague l'accès par sa fonction englobante (ajout de contexte courant, les
parent nodes sont déjà activés dans TK-33).

Risque : si l'implémentation révèle que la précision-en-fonction et le check-large ne se
composent pas proprement en un seul passage (interaction non triviale), STOP / retour Project
— ce serait que cet ADR a sous-estimé le couplage, pas un élargissement de scope. Le fork
serait alors rouvert, pas contourné en exécution.

## Note de priorité (hors décision, pour mémoire)

TK-34 est **réel mais différable**. Il ne corrige aucun bug live : le delta de précision ne
mord que dans un fichier multi-tables, et recettes.ts est le seul aujourd'hui — déjà couvert
par TK-32. Il ne queue-jump pas TK-20 / TK-10 / TK-12. Déclencheur naturel de sortie :
l'arrivée d'un second fichier DAL multi-tables (ou d'une 2ᵉ table mappée dans plannings.ts),
événement qui rend le trou dormant vivant.

## Alternatives écartées

- **Garder deux gates.** Fausse confiance (chacun a l'air complet, aucun ne l'est),
  duplication d'extraction AST, deux mécanismes de skip de join qui divergeront. Rejetée —
  c'est l'état dont on sort.
- **Fusion « tout large » (abandonner la précision-en-fonction).** Régression : perd la
  classe que seul TK-32 attrape dans recettes.ts (colonne d'une table lue dans la fonction
  d'une autre). On affaiblirait la garantie pour simplifier. Rejetée.
- **Fusion « tout précis » via `FUNCTION_TO_TABLE` rendu exhaustif.** Réintroduit une liste
  manuelle exhaustive qui rot, et reste aveugle à tout accès hors fonction nommée. C'est le
  défaut de TK-32 généralisé, pas corrigé. Rejetée.

## Références
- ADR-014 §3 (READ_CONTRACT, source du contrat de lecture), §4 (read-contract-gate, pattern
  jumeau) · ADR-015 (enum-check-gate, même famille de gardes statiques, même rejet de la
  « fausse confiance ») · ADR-013 (canonical.sql oracle) · ADR-010 §2 (granularité Rulesets) ·
  ADR-006 (DbError, contrat DAL).
- scripts/check-dal-read-contract.ts (TK-32, supprimé), scripts/check-dal-reads.ts (TK-33,
  hôte de la fusion), src/lib/db/read-contract.ts, .github/workflows/ci.yml.
- TK-16 (origine du read-contract), TK-32, TK-33, TK-34.
