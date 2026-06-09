# ADR-010 — Gate CI : trois jobs parallèles et `tsc --noEmit` repo-wide (TK-06)

**Statut** : Accepté
**Date** : 2026-06-05
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

### Déclencheur : l'épisode `validatePlanning` (4 → 3 args)

Un refactoring a réduit la signature de `validatePlanning` de 4 à 3 arguments.
Le test forteresse ciblant cette fonction était **type-cassé** : il passait toujours
`npm run test` au vert parce que Vitest et `tsx` strippent les types à l'exécution
via esbuild — les erreurs de type dans `tests/` sont invisibles en runtime.

Conclusion : `npm run test` vert n'est **pas** une preuve de compilation.
Le seul gate de type fiable est `tsc --noEmit` repo-wide, fichiers `tests/` inclus.

### Absence de gate automatique

Avant TK-06, la CI n'existait pas. La vérification de type était manuelle (convention
développeur) et le périmètre de `tsc` pouvait silencieusement exclure `tests/` sans
que personne ne le remarque. Le gate dépendait de la vigilance humaine et de l'invocation
manuelle de l'agent qa-engineer — aucun mécanisme ne bloquait un merge en cas d'oubli.

## Décisions

### 1 — Plateforme : GitHub Actions

Le workflow est défini dans `.github/workflows/ci.yml`.
Déclencheurs : `pull_request` vers `main`, `push` sur `main`.
Concurrence : un seul run actif par ref (`cancel-in-progress: true`) pour éviter
les faux verts obsolètes.

### 2 — Trois jobs distincts et parallèles

Trois jobs indépendants : `typecheck`, `test`, `validate`.

Le motif de séparation n'est **pas** la performance : c'est la granularité des
required status checks. Dans les Rulesets GitHub, chaque check est référencé par
le **nom du job**. Un seul job multi-steps aurait laissé un trou structurel : un
step skippé ou absorbé par un `continue-on-error` passe pour un succès au niveau
du job ; le ruleset reste vert. Trois jobs nommés séparément = trois checks
bloquants indépendants, chacun vérifiable en isolation.

### 3 — Gate de type : `tsc --noEmit` repo-wide, explicitement pas `next build`

```
npx tsc --noEmit
```

`next build` typecheck uniquement le graphe de l'application : les fichiers
`tests/` non importés par l'app sont hors de sa portée. C'est précisément ce
qui a laissé passer le bug d'origine. `tsc --noEmit` couvre l'intégralité des
fichiers inclus par `tsconfig.json`, tests compris.

### 4 — Garde durable du périmètre : assertion `tests/` dans le scope tsc

Un step complémentaire vérifie que `tests/` reste dans le scope de `tsc` :

```sh
npx tsc --noEmit --listFiles | grep -q '/tests/' || { echo "tsconfig ne couvre plus tests/"; exit 1; }
```

Sans ce guard, toute modification future de `tsconfig.json` excluant `tests/`
rendrait le gate silencieusement aveugle. Le gate rougirait bruyamment plutôt
que de devenir inopérant sans trace.

### 5 — Node 24, aligné CI ↔ Vercel

Le runner utilise Node 24, aligné sur l'environnement de production Vercel.

**Distinction importante :** la dépréciation GitHub du 16 juin 2026 porte sur le
**runtime JS des actions** (`actions/checkout`, `actions/setup-node`), pas
directement sur la version Node du projet. La correction consiste à monter ces
actions en `@v6` (qui embarque le runtime node24), **et non** en ajoutant un
champ `node-version` — ce qui serait une erreur de catégorie (le `node-version`
de `setup-node` contrôle la version Node disponible pour le projet, pas le runtime
de l'action elle-même). Les deux sont configurés ici, mais le motif premier est
le runtime des actions.

### 6 — Rulesets actifs sur `main`

Les trois checks (`typecheck`, `test`, `validate`) sont configurés comme required
status checks dans les Rulesets du repo. Le merge est bloqué tant que les trois
ne sont pas verts. Le gate est auto-portant : il ne dépend plus de la vigilance
humaine ni de l'invocation d'un agent.

### 7 — Playwright / E2E hors du gate pré-merge

Les tests end-to-end ne font pas partie de ce gate.

Raison : **intégrité du signal**. Un gate lent ou flaky entraîne le réflexe
"merge en rouge quand même" et détruit la crédibilité des trois checks rapides.
Les E2E vivent dans une lane séparée — chantier distinct, pas oublié.

## Conséquences

### Positives

- **Type-safety sur tests/.** Une erreur de type dans `tests/` bloque désormais
  le merge avant qu'elle n'atteigne `main`.
- **Gate auto-portant.** Le mécanisme de blocage ne dépend plus d'une convention
  ou d'un agent : les Rulesets le font respecter structurellement.
- **CI = prod pour Node.** Node 24 en CI et en production Vercel : les divergences
  de runtime sont éliminées.
- **Périmètre durable.** Le guard `--listFiles | grep /tests/` rougirait
  bruyamment si `tsconfig.json` exclut un jour `tests/` — plutôt que devenir
  aveugle en silence.

### Négatives

- **Trois `npm ci` parallèles.** Chaque job installe ses dépendances. Le cache npm
  de `actions/setup-node` atténue le coût, mais trois installs restent plus
  coûteux qu'une.

### Fragilités connues

- **Configuration Rulesets hors du repo.** Les required status checks sont définis
  manuellement dans l'interface GitHub, pas dans un fichier versionné. Si le repo
  est recréé, transféré, ou si la règle est désactivée par erreur, le gate redevient
  décoratif sans aucune trace dans `git`. Il n'existe pas à ce jour de mécanisme
  versionné équivalent aux Rulesets dans ce repo.

## Non-objectifs

Hors scope de cet ADR, mais explicitement notés :

- **Confiance E2E pré-merge.** La couverture Playwright n'est pas dans ce gate.
  Ce n'est pas un oubli — c'est une décision de préserver l'intégrité du signal
  des trois checks rapides.
- **Reporting de couverture.** Ni seuil ni badge de couverture ne sont imposés ici.

## Alternatives écartées

### Alternative A — Un seul job multi-steps

Un job unique `ci` avec des steps `typecheck`, `test`, `validate` en séquence.

Rejeté : un step skippé ou absorbé par `continue-on-error` laisse le job vert.
Les Rulesets réfèrent les jobs par nom, pas les steps. Un seul job nommé "ci"
offre un seul required check — qu'un type error ou un test raté peuvent
indistinctement rendre rouge. Pire : si un step est supprimé, le check reste
inscrit dans les Rulesets mais disparaît du workflow — il passe en "skipped",
non en "failed". Trois jobs nommés = trois points de défaillance explicites.

### Alternative B — `next build` comme gate de type

`next build` compile le projet et remonte les erreurs TypeScript de l'app.

Rejeté : `next build` ne typecheck que les fichiers atteints par le graphe
d'import de l'application. Les fichiers `tests/` non importés sont ignorés.
C'est exactement ce qui a permis au bug validatePlanning d'exister sans alerte.

### Alternative C — Inclure Playwright dans le gate pré-merge

Inclure les tests E2E dans ce workflow pour une couverture complète.

Rejeté : un gate lent et flaky engendre le réflexe "merge en rouge quand même".
Une fois ce réflexe installé, les trois checks rapides perdent leur crédibilité.
L'intégrité du signal prime sur l'exhaustivité du gate pré-merge.

## Critères de revue

Cette décision sera réévaluée si :

- Les Rulesets GitHub évoluent vers un format versionnable dans le repo (remplace
  la fragilité connue en § Conséquences).
- La durée des trois `npm ci` parallèles dépasse un seuil d'inconfort (envisager
  un cache d'artefact ou un job unique avec matrix).
- Un besoin de gate E2E pré-merge émerge et peut être satisfait sans dégrader
  le signal des trois checks rapides (SLA de durée, fiabilité démontrée).

## Références

- `.github/workflows/ci.yml` — implémentation du gate
- PR #18 — preuve d'acceptation : type error intentionnelle dans `tests/`, gate
  rouge comme attendu, PR fermée sans merge (`[DO NOT MERGE]`)
- PR #19 — bump `actions/checkout` et `actions/setup-node` v4→v6, mergée le
  2026-06-05
- Agent qa-engineer : check #2 figé en `tsc --noEmit` repo-wide (ce gate) ;
  check #7 ("CI verte avant merge") désormais ancré sur les trois required
  status checks de ce gate
- ADR-001 — doctrine sécurité allergènes ; le gate protège aussi les tests
  forteresse qui garantissent cette frontière
