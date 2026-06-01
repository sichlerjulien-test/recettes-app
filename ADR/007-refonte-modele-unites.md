# ADR-007 — Refonte du modèle d'unités d'achat (TK-02)

## Statut
Accepté

## Contexte

`build-list.ts` maintenait un `Set<Unit>` (`DISCRETE_UNITS`) en dur, déconnecté
de `UnitSchema`. Toute nouvelle unité ajoutée à `UnitSchema` risquait de ne pas
être incluse dans le Set, introduisant un arrondi silencieusement incorrect.

Par ailleurs, le champ `nom` de `IngredientSchema` portait une ambiguïté
(singulier ? pluriel ?) masquée par `nom_pluriel` existant mais inutilisé
par `buildShoppingList`. La liste de courses affichait systématiquement
`ingredient.nom` quelle que soit la quantité : "12 piece Œuf" au lieu de
"12 Œufs".

## Décision

### 1. Registre CONTINUOUS_UNITS / DISCRETE_UNITS dans schemas.ts

On déplace la classification continue/discrète dans `schemas.ts`, source
unique de vérité (ADR-002) :

```typescript
export const CONTINUOUS_UNITS = ['g', 'kg', 'ml', 'l', 'cuillere-soupe', 'cuillere-cafe'] as const;
export const DISCRETE_UNITS   = ['piece', 'botte', 'sachet'] as const;
export const UnitSchema = z.enum([...CONTINUOUS_UNITS, ...DISCRETE_UNITS]);
```

Le champ `type_unite: z.enum(['continue', 'discrete'])` dans `IngredientSchema`
a été **rejeté** : le caractère discret est une propriété intrinsèque de l'unité,
pas de l'ingrédient. Le placer dans l'ingrédient créerait une incohérence
mutable non détectable statiquement (`unite_achat: 'piece'` avec `type_unite:
'continue'`).

### 2. Renommage nom → nom_singulier (migration one-shot)

`IngredientSchema.nom` devient `IngredientSchema.nom_singulier`.

Stratégie : migration one-shot. Aucun alias de compatibilité. Les trois
couches sont mises à jour atomiquement dans le même commit :
- `IngredientSchema` dans `schemas.ts`
- 166 fichiers YAML dans `data/ingredients/`
- DAL `src/lib/db/ingredients.ts` (mapIngredientRow)
- Script `scripts/build-data.ts` (IngredientRow.nom_singulier)
- Migration SQL `scripts/migrations/004-rename-ingredient-nom.sql`
- Fixtures de test

### 3. Pluralisation dans buildShoppingList

`nom_affiche` est maintenant dérivé de `quantite_totale` :

```typescript
nom_affiche: quantite_totale > 1 ? ingredient.nom_pluriel : ingredient.nom_singulier,
```

### 4. Suppression de "pièce" dans l'UI

Le composant `ShoppingListSection.tsx` n'affiche plus `unite_affichee`
quand celle-ci vaut `'piece'`. Le `ShoppingItemSchema` ne change pas :
`unite_affichee: UnitSchema` reste intact.

## Alternatives écartées

| Alternative | Motif de rejet |
|---|---|
| `type_unite` dans l'ingrédient | Redondance mutable — l'incohérence `unite_achat:'piece'` + `type_unite:'continue'` est non détectable |
| `z.object({ id, type })` pour `unite_achat` | Sur-ingénierie — casse tous les YAML + rend la lecture moins claire |
| `DisplayUnit` distinct de `Unit` | Logique UI dans le type métier — viole la séparation couche métier / présentation |
| Alias `nom` déprécié + `nom_singulier` optionnel | Complexité inutile — la migration one-shot est plus propre dans une base contrôlée |

## Conséquences

- `ContinuousUnit` et `DiscreteUnit` sont exportés depuis `schemas.ts`
- `build-list.ts` n'a plus de Set hardcodé : importe `DISCRETE_UNITS`
- La colonne `ingredients.nom` Supabase est renommée en `nom_singulier`
  via `scripts/migrations/004-rename-ingredient-nom.sql`
- allergen-guard vérifie le diff des 4 fichiers sensibles avant merge
  (oeuf.yaml, lait-entier.yaml, farine-blanche.yaml, farine-ble-t55.yaml)
