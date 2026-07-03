# ADR-022 — Créneau non-culinaire (« resto / non cuisiné »)

**Statut :** Accepté (2026-07-03)

## Contexte

Un séjour comporte des repas pris hors cuisine (resto, restes, à l'extérieur). Aujourd'hui `PlanningEntry` porte `recette_id` en champ requis, et `validateCoherence` applique `slots_mismatch` (bloquant) : les entries doivent correspondre exactement à `expectedSlots`. Un créneau sans recette n'a donc aucune représentation légale — il déclenche `slots_mismatch` ou force un `recette_id` bidon.

## Décision

1. `PlanningEntry` devient une union discriminée :
   `{ kind: 'recette', jour, repas, recette_id, portions } | { kind: 'resto', jour, repas }`

   Rejet explicite de la variante « `recette_id` nullable » : un `null` sans discriminant rend indistinguables un resto voulu et un trou de génération (sous-production LLM), ce que `slots_mismatch` existe précisément pour attraper.

2. **Amende ADR-009** : `slots_mismatch` compte un slot resto comme rempli. `recette_dupliquee` et `ingredient_principal_consecutif` ignorent les slots resto (ils n'ont pas de `recette_id` — traitement explicite, pas via le skip des `recette_id` inconnus existant). Les validators allergen et dietary font de même.

3. Le marquage resto est un **input de séjour**, saisi au formulaire (`repartition_repas.slots_resto`), qui survit à la re-génération. Il est consommé par la génération (slot exclu de `expectedSlots` LLM et de la requête LLM) et matérialisé dans `entries` sous la variante `resto`. La persistance de `slots_resto` dans le JSONB `repartition_repas` de la table `sejours` est migration-free (JSONB opaque dans les RPCs existants).

4. **Orthogonal à ADR-001.** Un slot resto est l'absence de nourriture : pool pré-LLM, frontière LLM, validateur allergènes post-LLM inchangés. Aucun contact avec `src/lib/allergens/`.

5. **Backward compatibility** : les entrées existantes en DB sans champ `kind` sont traitées comme `kind: 'recette'` via `z.preprocess` dans `PlanningEntryFullSchema`.

## Conséquences

- Toute lecture de `entries` doit brancher sur `kind`.
- Un séjour tout-resto est légal (planning valide, liste de courses vide).
- La variante « marquer resto après génération » (edit-time) n'est pas couverte ici : elle est un swap recette → resto et devra passer par le picker de TK-41 (ADR-021), pas par un chemin de mutation parallèle.
- `build-list.ts` : les entrées `kind: 'resto'` sont ignorées → liste vide pour ces créneaux.
- `swap-meal.ts` : les entrées `kind: 'resto'` ne peuvent pas être ciblées par le swap.
- `generate-planning.ts` : reçoit `restoSlots`, les injecte post-LLM, passe les slots filtrés au client LLM.
