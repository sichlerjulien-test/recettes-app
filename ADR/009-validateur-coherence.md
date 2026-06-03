# ADR-009 — Séparation du validateur de cohérence hors du module sécurité

**Statut** : Accepté
**Date** : 2026-06-03
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

Les règles de cohérence `slots_mismatch`, `recette_dupliquee` et
`ingredient_principal_consecutif` sont actuellement implémentées dans
`src/lib/allergens/validator.ts` (fonction `validatePlanning`), fusionnées
avec la validation de sécurité (allergènes, régimes, `recette_inconnue`) à
l'intérieur du module sanctuarisé par ADR-001.

ADR-001 pose une doctrine claire : `lib/allergens/` ne doit jamais être
modifié sauf pour corriger un bug de sécurité ou traiter un allergène EU14
manquant. Le module est soumis au protocole allergen-guard (revue bloquante
sur toute modification). Cette invariance est précisément sa valeur : zéro
surprise, zéro régression de sécurité par contamination.

La cohérence est de nature fondamentalement différente. C'est une logique
**évolutive** : ajout de règles (variété de cuisine, féculents dominants),
tuning des seuils, expérimentation. La loguer dans le module "ne jamais
toucher" signifie qu'améliorer le planning nécessite de déclencher le
protocole allergènes — soit le court-circuiter (dangereux), soit supporter
une friction excessive sur des évolutions bénignes.

Cette confusion de responsabilités est le motif central de cet ADR.

## Décisions

### 1 — Nouveau module `src/lib/coherence/`

Un module dédié `src/lib/coherence/` est créé avec une fonction principale
`validateCoherence(planning, recettesMap, expectedSlots)` (signature
indicative, à confirmer à l'implémentation — pas de participants, propre à
la sécurité).

Les règles `slots_mismatch`, `recette_dupliquee`,
`ingredient_principal_consecutif` et leurs types de violation associés sont
extraits de `allergens/validator.ts` et déplacés dans ce module.

`validatePlanning` (dans `lib/allergens/`) ne conserve que la validation de
sécurité et d'intégrité : `allergen`, `regime`, `recette_inconnue`. La
surface du sanctuaire se réduit à sa mission originelle.

### 2 — Sévérité externalisée comme constante de routing

La sévérité des violations cohérence est une constante de routing :

```ts
const COHERENCE_SEVERITY: Record<CoherenceViolationKind, 'bloquant' | 'qualite'> = { ... }
```

déclarée dans `lib/coherence/`. **Il n'y a pas de champ `severity` sur les
objets violation.** `ValidationResultSchema` (ADR-002) reste inchangé.

Motif : la sévérité est une propriété du *kind*, pas de l'instance. Un champ
Zod rendrait possible de mistaguer accidentellement une violation `allergen`
en `'qualite'` — fuite de catégorie silencieuse non détectable à la
compilation. La constante de routing externe garantit que seuls les *kinds*
cohérence ont une sévérité configurable. Cette décision est alignée avec
ADR-002 : Zod encode les types métier, pas les politiques de routing.

La map ne couvre que les kinds cohérence. Les violations sécurité n'ont pas
de sévérité configurable.

### 3 — `ingredient_principal_consecutif` par jour calendaire

La règle d'unicité de l'ingrédient principal est ratifiée par **jour
calendaire** (la frontière est le jour, pas une fenêtre de 24h glissantes).
Ce statu quo est rendu explicite : il est conforme à l'implémentation
actuelle et délibéré.

### 4 — Flot post-LLM : deux validateurs en séquence

`generatePlanning` appelle deux validateurs en séquence après réception de
la sortie LLM :

1. `validatePlanning` (sécurité, dans `lib/allergens/`) — résultat dur
2. `validateCoherence` (cohérence, dans `lib/coherence/`) — résultat routé
   par `COHERENCE_SEVERITY`

Le retry se déclenche sur **(violation sécurité) OU (violation cohérence
`'bloquant'`)**.

Les violations `'qualite'` **ne déclenchent pas de retry**. Elles sont
renvoyées comme avertissements sur un planning accepté.

### 5 — Contrat de retour : avertissements `'qualite'` sur la branche `ok: true`

Le résultat succès de `generatePlanning` porte les avertissements `'qualite'`
via un champ optionnel sur la branche `ok: true` :

```ts
{ ok: true; entries: PlanningEntry[]; warnings?: CoherenceWarning[] }
```

C'est une extension non-breaking de la branche `ok: true` au sens d'ADR-005 :
les callers existants (qui ignorent `warnings`) compilent sans changement.

**Note** : cette conséquence est dérivée des décisions 1–4 et n'a pas été
soumise séparément à la revue architect. Elle est documentée ici comme
conséquence dérivée, pas comme décision contestée.

## Conséquences

### Positives

- **Surface du sanctuaire réduite.** `lib/allergens/validator.ts` ne contient
  plus que la sécurité : les modifications futures sont moins susceptibles de
  déclencher allergen-guard à tort et l'attention de revue reste ciblée sur
  la vraie frontière de sécurité.
- **Cohérence évolutive sans friction.** Ajouter ou modifier une règle de
  cohérence n'implique plus de toucher `lib/allergens/`, ni de déclencher le
  protocole allergènes.
- **Séparation des niveaux de criticité.** Un bug dans `validateCoherence`
  n'affecte pas la garantie de sécurité ; un bug dans `validatePlanning`
  reste circonscrit à sa frontière.

### Négatives

- **Un import de plus dans `generatePlanning`.** `src/lib/llm/generate-planning.ts`
  dépend désormais de `lib/coherence/` en plus de `lib/allergens/`.
- **Migration de code.** L'extraction des règles et types de
  `allergens/validator.ts` vers `lib/coherence/` touche du code dans le
  sanctuaire — à réaliser sous revue allergen-guard, une seule fois.

### Neutres

- Pas de changement de comportement observable sur les plannings existants :
  les mêmes règles s'appliquent, dans le même ordre.
- `ValidationResultSchema` inchangé.

## Non-objectifs

Hors scope de cet ADR, mais rendus possibles par la structure qu'il pose :

- Implémentation de la règle "variété de cuisine" dans `lib/coherence/`
- Ajout de `feculent_dominant` à la règle d'unicité de l'ingrédient principal
- Backstop équipement post-LLM (règle cohérence sur le matériel disponible)
- ADR dédié aux exclusions alimentaires (préférences non-allergènes)

Cet ADR pose la structure ; les nouvelles règles font l'objet de tickets
séparés.

## Alternatives écartées

### Alternative A — Laisser la cohérence dans `lib/allergens/validator.ts`

Statu quo jusqu'à cet ADR. Devient intenable dès que les règles de cohérence
évoluent : chaque modification déclenche le protocole allergen-guard sur du
code non-sécurité, crée de la résistance organisationnelle, et dilue
l'attention de revue sur la vraie frontière de sécurité.

### Alternative B — Champ `severity` sur les objets violation (schéma Zod)

Rejeté. Ajouter `severity` à `ValidationResultSchema` permettrait de
mistaguer une violation sécurité (`allergen`, `regime`) en `'qualite'` —
fuite de catégorie silencieuse non détectable à la compilation. La constante
de routing externe garantit que seuls les *kinds* cohérence ont une sévérité
configurable (Décision 2). Voir ADR-002.

### Alternative C — Module `lib/planning/` absorbant LLM + cohérence

Possible à terme, mais prématuré. `lib/llm/` et `lib/coherence/` ont des
cycles de vie différents. Un regroupement risque de recréer le couplage
sécurité/cohérence qu'on cherche à éliminer, dans un autre emballage.

## Critères de revue

Cette décision sera réévaluée si :

- Les règles de cohérence acquièrent une criticité réglementaire (ex :
  contraintes nutritionnelles légalement opposables) — la frontière sanctuaire
  devrait alors être élargie.
- `lib/coherence/` grossit au point de nécessiter une architecture interne
  (registry de règles, moteur de contraintes) — envisager un ADR dédié.

## Références

- ADR-001 — Frontière sécurité inchangée ; défense en profondeur intégralement
  dans `lib/allergens/`
- ADR-002 — Justifie le placement de la sévérité hors du schéma Zod
- ADR-004 — Amendé : `generatePlanning` dépend désormais aussi de
  `lib/coherence/` ; le retry s'affine
- ADR-005 — Extension non-breaking de la branche `ok: true` (`warnings?`)
