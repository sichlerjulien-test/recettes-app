# ADR-002 — Source unique de vérité Zod pour les types métier

**Statut** : Accepté
**Date** : 2026-04-25
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

Le projet a démarré avec deux sources de vérité pour les types métier :
- src/lib/types/domain.ts : interfaces TypeScript écrites à la main
- src/lib/types/schemas.ts : schémas Zod pour validation runtime

Un check de cohérence compile-time (introduit en Session 5) force les deux
représentations à rester équivalentes. Ce check a déjà détecté une vraie
divergence en pratique, ce qui valide son utilité mais expose le coût de
maintenance du double-codage.

À terme, chaque nouveau type métier nécessiterait :
- Une interface dans domain.ts
- Un schéma équivalent dans schemas.ts
- Un check de cohérence pour les coupler

Coût récurrent qui scale mal.

## Décision

Adopter Zod comme source unique de vérité pour tous les types métier.
src/lib/types/domain.ts devient un fichier de re-exports de types inférés
depuis les schémas Zod via z.infer<typeof XxxSchema>.

Pattern type :

```ts
// schemas.ts (source de vérité)
export const RecetteSchema = z.object({ ... });

// domain.ts (dérive)
export type Recette = z.infer<typeof RecetteSchema>;
```

## Conséquences

### Positives
- Une seule définition par type : maintenance divisée par 2
- Divergence runtime/compile-time impossible par construction
- Validation Zod garantie pour tout type métier (utile pour parsing YAML,
  validation API, validation sortie LLM)
- Pattern standard de l'écosystème TypeScript moderne

### Négatives
- Lecture de domain.ts moins immédiate (il faut comprendre Zod pour
  remonter à la définition)
- Couplage fort à Zod : changer de bibliothèque de validation
  impliquerait de toucher tous les types
- Quelques cas limites où l'inférence Zod produit des types moins lisibles
  que des interfaces (ex : unions complexes)

### Neutres
- Le check de cohérence compile-time devient inutile et sera supprimé
- Pas d'impact runtime ni performance

## Alternatives écartées

### Alternative A — Maintenir les deux sources avec check de cohérence
Approche actuelle. Le check fonctionne mais coûte une définition double
par type. Acceptable à 5 types, intenable à 20+.

### Alternative B — Source unique TypeScript, schémas Zod générés
Possible avec des outils comme ts-to-zod, mais ajoute une étape de build,
casse l'auto-complétion sur les schémas, et impose une dépendance externe
sans valeur claire pour ce projet.

## Critères de revue

Cette décision sera réévaluée si :
- Une bibliothèque de validation supérieure à Zod émerge
- Le coût d'expressivité Zod devient bloquant sur des types complexes
- Le projet évolue vers une stack sans validation runtime (peu probable)

## Références
- Zod documentation : https://zod.dev
- ADR-001 : architecture validation allergènes (utilise Zod)
