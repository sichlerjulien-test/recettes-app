# ADR-021 — Régénération partielle d'un repas : swap déterministe avec picker

**Statut** : Accepté
**Date** : 2026-07-02
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet
**Lié à** : ADR-001 (4 étages, forteresse allergènes) · ADR-004 (génération LLM) ·
            ADR-009 + amendement TK-39 (validateur cohérence, fenêtre glissante) ·
            ADR-017 (frontière LLM hors E2E)

## Contexte

Sarah génère un planning, en juge les repas (recettes affichées depuis TK-38), et
en rejette un — un seul. Régénérer tout le planning rebrasse les repas qu'elle
gardait : inacceptable au moment précis où elle est satisfaite du reste. TK-41
demande de remplacer un créneau sans toucher aux autres.

Un fork de scope a été tranché au cadrage : le serveur pique-t-il un remplaçant
(bouton), ou expose-t-il les remplaçants éligibles pour que Sarah choisisse
(picker) ? Le single-pick a été rejeté comme intermédiaire jetable — le design
déterministe énumère déjà l'ensemble éligible, et le picker reviendrait vite. Le
picker ne franchit PAS la frontière du XL écarté : celui-ci était un changement de
paradigme (bâtir un planning plat par plat depuis une page vide, LLM optionnel) ;
le picker est une affordance de correction sur un planning déjà généré. Deux axes
distincts.

## Décision

Le swap est **ADR-001-shaped** : pool filtré en entrée, pile de validateurs en
sortie, picker déterministe à la place du LLM.

1. **Déterministe, sans LLM.** Remplacer un créneau à voisins figés est une
   satisfaction de contrainte triviale. Le LLM n'ajouterait que coût, latence,
   non-déterminisme et une 2e porte d'entrée LLM. Exclu.

2. **Pool identique à la génération.** Candidats tirés de
   `filterByExclusions(filterRecipes(catalogue, constraints))`, mêmes `constraints`
   via `buildPlanningConstraints`. Sûreté allergènes / exclusions / équipement
   **par construction**.

3. **Éligibilité = vrai `validateCoherence`, zéro réimplémentation.** Un candidat
   est éligible au créneau S ssi le planning hypothétique (candidat substitué en S,
   reste gardé) passe `validateCoherence` sans violation `bloquant`. La recette
   courante est exclue (elle a été rejetée). `ingredient_principal_consecutif` et
   `recette_dupliquee` (fenêtre glissante) tombent automatiquement. Recoder un
   check local « conflit voisins » créerait une 2e source de vérité des règles §4 —
   le piège nommé par ADR-009 / TK-40b. Interdit.

4. **Picker.** Le serveur expose l'ensemble éligible ; l'utilisateur choisit.

5. **Confiance zéro envers le client.** Le client renvoie un `recette_id` choisi.
   On ne lui fait pas plus confiance qu'au LLM. Au commit, le serveur **recompute**
   l'éligibilité, confirme l'appartenance du choix à l'ensemble éligible, **rejette**
   tout id non éligible même bien formé, puis fait tourner toute la pile
   (`validatePlanning` + `validateExclusions` + `validateCoherence`) sur le planning
   résultat. « Prouvablement sûr par construction » est exactement la confiance
   qu'ADR-001 refuse d'accorder au générateur. La pile tourne. Coût nul, discipline
   maintenue.

6. **Snapshot immuable.** Le commit écrit une **nouvelle ligne pleine** via
   `createPlanning` (copie des entries, un seul `recette_id` changé). Latest-wins,
   aucune migration, aucune mutation. La liste de courses (étage 4, 100% calculée)
   se recalcule gratuitement sur le dernier planning.

7. **Épuisement = erreur explicite.** Aucun candidat éligible (pool mince : seule la
   courante tient) → kind `no_alternative_available`, distinct de `pool_empty`.
   L'UI montre un empty state. Jamais de no-op muet, jamais un pick incohérent ou
   unsafe « pour faire quelque chose ».

8. **Frontière de scope.** Le picker corrige un créneau existant. Il ne bâtit pas
   un planning plat par plat depuis une page vide — la version XL reste écartée.

## Conséquences

**Positives** : sûreté héritée du pool filtré ET re-validée ; cohérence prouvée par
réutilisation du vrai validateur (aucune règle recodée) ; liste de courses correcte
gratuitement ; zéro migration ; snapshot append-only préservé.

**Coût assumé** :
- Une nouvelle frontière de confiance client → serveur, traitée comme la frontière
  LLM : jamais de confiance, re-validation systématique. C'est la seule surface de
  sûreté réellement neuve, et elle est cadrée, pas ouverte.
- Effort L (route de lecture des éligibles + route de commit re-validé + UI liste),
  contre M pour le single-pick abandonné.

**Non touché, à acter noir sur blanc** : `src/lib/allergens/` est **consommé, pas
modifié** → pas de gate sanctuaire (100 itérations + double review) ; les règles §4
sont enforced à l'identique ; les 4 étages d'ADR-001 sont mirrorés, pas contournés ;
la persistance append-only est préservée.

## Alternatives écartées

- **Swap LLM mono-créneau.** Coût, latence, non-déterminisme, 2e porte LLM avec sa
  propre sémantique de retry, sur une SAT triviale. Zéro bénéfice. Rejeté.
- **Single-pick serveur (bouton).** L'ensemble éligible est déjà énuméré pour le
  picker ; le single-pick le jette pour n'en garder qu'un, et deviendrait du
  jetable dès l'ouverture du picker. Construire-puis-jeter. Rejeté.
- **Mutation de la ligne / de l'entry.** Casse le snapshot immuable, exige une
  migration/RPC, recâble le recalcul de la liste de courses. Rejeté.
- **Check d'éligibilité local recodé.** 2e source de vérité des règles §4. Rejeté.
- **Construction plat-par-plat depuis planning vide (XL).** Changement de paradigme
  hors scope. Reste écarté ; si redemandé, nouvel ADR, ne pas étendre celui-ci.

## Critères de revue

Rouvrir si :
- Le catalogue grossit au point qu'un ensemble éligible par créneau devient
  ingérable en liste plate (tri / recherche nécessaires) → ADR UI dédié.
- Un mode « bâtir depuis vide » est demandé → nouvel ADR, pas une extension d'ici.

## Références

- ADR-001, ADR-004, ADR-009 (+ amendement TK-39), ADR-017.
- `src/lib/planning/swap-meal.ts` (nouveau) · `src/lib/coherence/` ·
  `src/lib/allergens/filter.ts` · `src/lib/dietary/filter.ts` ·
  `src/lib/db/plannings.ts`.
- TK-41.
