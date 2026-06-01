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

`nom_affiche` est dérivé de `unite_affichee` (l'unité **après** conversion vers
`unite_achat`) et de `quantite_totale`. La pluralisation s'applique **uniquement**
aux unités discrètes :

```typescript
nom_affiche: DISCRETE_UNIT_SET.has(unite_affichee) && quantite_totale > 1
  ? ingredient.nom_pluriel
  : ingredient.nom_singulier,
```

Pour les unités continues (g, kg, ml, l, cuillere-soupe, cuillere-cafe), le format
d'affichage est `{quantite}{unite} de {nom_singulier}` — le nom n'est jamais
pluralisé, quelle que soit la quantité. `nom_pluriel` reste un champ requis dans
`IngredientSchema` pour tous les ingrédients (y compris continus) car la contrainte
est une règle d'usage applicatif, pas une contrainte d'intégrité de donnée.

### 5. Arrondi par palier pour g et ml

Les quantités affichées en grammes (`g`) ou millilitres (`ml`) suivent un arrondi
commercial par palier, vers le haut :

| Plage           | Arrondi au multiple de |
|-----------------|------------------------|
| < 50            | 10                      |
| 50 – 500        | 50                      |
| > 500           | 100                     |

Exemple : 187,5 g → 200 g (palier 50, `ceil(187,5 / 50) × 50`).

La fonction `roundByScale` vit dans `build-list.ts` et n'est pas exportée.
Alternative écartée : `round2` uniforme — produit des valeurs non achetables
("47 g de beurre").

### 6. Arrondi des cuillères

`cuillere-soupe` et `cuillere-cafe` restent dans `CONTINUOUS_UNITS`
(classification physique inchangée). Dans `build-list.ts`, un `CEIL_UNIT_SET`
local regroupe `DISCRETE_UNITS ∪ {cuillere-soupe, cuillere-cafe}` et applique
`Math.ceil` : on ne peut pas mesurer 2,33 cuillères à soupe en courses.

`CEIL_UNIT_SET` porte la règle de présentation ; `DISCRETE_UNITS` dans `schemas.ts`
continue de porter la sémantique physique. Alternative écartée : reclasser les
cuillères dans `DISCRETE_UNITS` — changerait leur sémantique dans tous les autres
contextes du modèle.

### 4. Suppression de "pièce" dans l'UI

Le composant `ShoppingListSection.tsx` n'affiche plus `unite_affichee`
quand celle-ci vaut `'piece'`. Le `ShoppingItemSchema` ne change pas :
`unite_affichee: UnitSchema` reste intact.

## Alternatives écartées supplémentaires (complément TK-02)

| Alternative | Motif de rejet |
|---|---|
| `nom_pluriel` optionnel pour le continu | Sur-ingénierie — 166 YAML ont le champ, la contrainte vit correctement dans le code |
| `round2` pour g/ml | Produit des valeurs non achetables en courses |
| Reclasser cuillères dans `DISCRETE_UNITS` | Change la sémantique physique de l'unité dans tout le modèle |

## Alternatives écartées (initiales)

| Alternative | Motif de rejet |
|---|---|
| `type_unite` dans l'ingrédient | Redondance mutable — l'incohérence `unite_achat:'piece'` + `type_unite:'continue'` est non détectable |
| `z.object({ id, type })` pour `unite_achat` | Sur-ingénierie — casse tous les YAML + rend la lecture moins claire |
| `DisplayUnit` distinct de `Unit` | Logique UI dans le type métier — viole la séparation couche métier / présentation |
| Alias `nom` déprécié + `nom_singulier` optionnel | Complexité inutile — la migration one-shot est plus propre dans une base contrôlée |

## Conséquences

- `ContinuousUnit` et `DiscreteUnit` sont exportés depuis `schemas.ts`
- `build-list.ts` importe `DISCRETE_UNITS` depuis `schemas.ts` et définit
  localement `CEIL_UNIT_SET` (= `DISCRETE_UNITS` ∪ cuillères) pour `finalize()`
- `nom_pluriel` est consommé uniquement quand `unite_affichee ∈ DISCRETE_UNITS`
- La colonne `ingredients.nom` Supabase est renommée en `nom_singulier` **et**
  la colonne `nom_pluriel` est ajoutée, via la migration consolidée
  `scripts/migrations/004-rename-ingredient-nom.sql` (idempotente)
- allergen-guard vérifie le diff des 4 fichiers sensibles avant merge
  (oeuf.yaml, lait-entier.yaml, farine-blanche.yaml, farine-ble-t55.yaml)
