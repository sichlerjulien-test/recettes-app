# ADR-005 — Pattern de retour Result-like pour les fonctions à erreurs métier

**Statut** : Accepté
**Date** : 2026-04-27
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

La fonction `generatePlanning` du module LLM (cf. ADR-004) retourne un
type discriminé :

```ts
{ ok: true; entries: PlanningEntry[] } | { ok: false; error: LLMError }
```

plutôt que de lever des exceptions. La review architect du Sprint 1 a
légitimement demandé si ce pattern est une convention globale ou un
choix local au module LLM.

D'autres fonctions à venir auront le même besoin :
- Génération de la liste de courses (peut échouer si planning invalide)
- Parse des YAML utilisateur (peut échouer pour des raisons métier)
- Création de séjour (validation, conflit de token)

Décision à formaliser pour éviter trois conventions différentes dans
trois mois.

## Décision

**Convention globale du projet** : toute fonction publique de
`src/lib/` qui peut échouer pour des raisons **métier prévisibles**
retourne un type discriminé Result-like :

```ts
type Result<TPayload extends Record<string, unknown>, E> =
  | ({ ok: true } & TPayload)
  | { ok: false; error: E };
```

---

**Convention sur le payload de succès** : la branche `ok: true` contient
les champs métier directement, pas un sous-objet `value`. Cela améliore
la lisibilité côté caller (`result.entries` plutôt que `result.value.entries`).

Exemples conformes :
- generatePlanning : `{ ok: true; entries: PlanningEntry[] }`
- buildShoppingList (futur) : `{ ok: true; items: ShoppingItem[]; categories: Category[] }`
- createSejour (futur) : `{ ok: true; sejour: Sejour; token: string }`

La branche `ok: false` reste invariante : toujours un seul champ `error`
typé.

---

Critère "raison métier prévisible" :
- Cas géré explicitement dans la logique (pool vide, validation échec,
  contrainte non respectée)
- Cas qui peut nécessiter une UX spécifique côté caller

Les exceptions (`throw`) restent réservées aux **erreurs programmeur**
(invariants brisés, types invalides, ressources internes manquantes).

## Conséquences

### Positives
- Caller force à gérer le cas d'erreur via discriminant TypeScript
- Pas de try/catch oublié sur des erreurs métier prévisibles
- Type-safety bout en bout : pas de "any" sur les erreurs
- Cohérence du code applicatif

### Négatives
- Légère verbosité côté caller (`if (!result.ok) return result.error`)
- Apprentissage initial pour les contributeurs habitués aux exceptions
- Pas de stack trace automatique sur les erreurs métier (à compenser
  par des messages d'erreur explicites)

### Neutres
- Adoption progressive : seules les nouvelles fonctions doivent suivre
  le pattern. Les fonctions pures déjà écrites (compute, filter,
  validator) restent telles quelles si elles ne lèvent pas d'erreur.

## Alternatives écartées

### Alternative A — Exceptions partout
Pattern majoritaire en JavaScript/TypeScript historique mais :
- Erreurs métier non visibles dans le type de retour
- Risque d'oubli de try/catch
- Mauvais signal sémantique (les erreurs métier ne sont pas
  exceptionnelles, elles sont prévisibles)

### Alternative B — Bibliothèque dédiée (neverthrow, ts-results, fp-ts)
Plus rigoureux mais ajoute une dépendance pour ce qu'un type discriminé
inline gère très bien. À reconsidérer si on a 20+ types Result et
besoin de combinators avancés (`.map`, `.andThen`, etc.).

### Alternative C — Retour `T | null` ou `T | undefined`
Perte d'information sur la cause de l'erreur. Inadapté.

## Critères de revue

Cette décision sera réévaluée si :
- Plus de 10 fonctions Result rendent les combinators utiles
  (envisager neverthrow ou similaire)
- Une autre convention émerge dans l'équipe pour des raisons concrètes

## Références
- ADR-004 : module LLM utilise déjà ce pattern
- Pattern inspiré de Rust : https://doc.rust-lang.org/std/result/
