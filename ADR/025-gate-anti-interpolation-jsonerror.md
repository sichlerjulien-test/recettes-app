# ADR-025 — Gate CI anti-interpolation d'internals dans jsonError (arg 3)

**Statut :** Accepté (2026-07-08)

## Contexte

TK-59 a corrigé une fuite d'internals (message Supabase brut renvoyé en 500
via `dbErrorToResponse`). Une correction ponctuelle ne garde rien : rien
n'empêche un futur site d'appel de `jsonError` d'interpoler à nouveau un
`.message`, `.cause` ou tout autre membre d'objet interne dans l'argument
`message` (arg 3) exposé tel quel au client. TK-66 pose le gate CI qui rend
la classe d'erreur TK-59 irrécidivable.

Inventaire au cadrage : deux sites dans `src/lib/api/error-mapping.ts`
(`error.cause` en `constraint_violation`, `` `${error.entity} introuvable` ``
en `not_found`). Le premier passage du gate (implémenté ci-dessous) en a
révélé un troisième, non recensé au cadrage :
`src/app/api/sejours/[id]/planning/route.ts`, une variable locale `message`
assignée par ternaire de deux littéraux — jamais un internal, mais non
résolue par un gate syntaxique qui ne fait pas d'analyse de flux. Traité par
le même mécanisme (`businessMessage()`), sans changement d'approche ni de
périmètre : l'écart d'inventaire ne change pas la localisation ni l'effort.

## Décision

1. **Allowlist, pas denylist.** L'arg 3 de `jsonError` doit être : un
   littéral string, un template literal à interpolations exclusivement
   littérales, ou le retour de `businessMessage()`. Tout le reste échoue le
   gate. Arg 4 (`details`) reste hors périmètre — canal assumé du détail
   structuré (ex. `error.flatten()` de Zod).

2. **Règle uniforme, sans exception au cas par cas.** Tout non-littéral en
   arg 3 passe par `businessMessage()`. Aucun accès-membre spécifique n'est
   whitelisté comme « connu sûr » — ce serait une denylist déguisée, qui
   pourrit à l'identique dès qu'un nouveau membre interne apparaît. Le gate
   est syntaxique : il ne résout pas les types, ne juge pas la provenance.
   Que `error.entity` soit un littéral à tous les sites actuels est vrai et
   hors sujet — s'y fier serait le raisonnement fail-open qu'on rejette ici.

3. **`businessMessage()` est une assertion de confiance, pas un
   assainisseur.**

   ```ts
   declare const brand: unique symbol;
   export type SafeMessage = string & { readonly [brand]: 'SafeMessage' };

   export function businessMessage(s: string): SafeMessage {
     return s as SafeMessage;
   }
   ```

   Il accepte n'importe quelle chaîne — aucune validation runtime. La
   garantie du gate n'est pas runtime : c'est que plus aucune interpolation
   n'est accidentelle, et que chaque chemin de fuite devient un wrap
   explicite, greppable, revu. Un reviewer devant
   `businessMessage(error.cause)` doit toujours vérifier que la source est
   auteur-contrôlée — le gate garantit que ce sont les seuls endroits à
   regarder, il ne dispense pas de la revue.

4. **Harnais du gate : API compilateur TypeScript brute, pas ts-morph, pas
   ESLint.** Ni l'un ni l'autre n'est présent dans ce dépôt (aucune
   dépendance `ts-morph`, aucun `eslint.config.*`/`.eslintrc*`). La
   convention réelle du repo pour les gates CI basés AST est déjà posée par
   `scripts/check-dal-reads.ts` (TK-33/34) : `ts.createSourceFile` +
   `ts.forEachChild`, `typescript` étant déjà une dépendance directe (utilisé
   par `tsc`). Le gate TK-66 (`scripts/check-jsonerror-message.ts`) suit ce
   même pattern : fonctions exportées et testées unitairement, garde
   `import.meta.url === process.argv[1]` pour l'exécution CLI, sortie
   `file:line` sur stderr, exit 1 au premier écart. Zéro nouvelle
   dépendance.

## Conséquences

### Positives
- Zéro nouvelle dépendance (réutilise `typescript`, déjà présent).
- Cohérent avec le seul autre gate AST du repo (`check-dal-reads.ts`) :
  même pattern, même discipline de test, même point de wiring CI.
- Le gate est syntaxique et fail-closed : un nouveau site qui interpole un
  membre non wrappé casse la CI immédiatement, avec `file:line`.

### Négatives
- `businessMessage()` ne protège de rien au runtime — un mauvais wrap
  (`businessMessage(error.stack)`) passe le gate. Documenté explicitement au
  point 3 pour éviter la confusion avec un scrubber.
- Le gate ne couvre qu'arg 3. Un futur canal d'exposition d'internals
  ailleurs que `jsonError` (ex. un nouveau helper de réponse) n'est pas
  couvert — à réévaluer si un tel helper apparaît.

## Alternatives écartées

### Alternative A — Denylist de membres connus (`.message`, `.cause`, `.stack`)
Rejeté : pourrit à l'identique dès qu'un nouveau membre interne (ex. un futur
champ d'erreur Supabase) apparaît sans être ajouté à la liste. La classe
d'erreur reviendrait par un angle mort de la denylist — exactement le
scénario que TK-66 doit fermer.

### Alternative B — ts-morph
Rejeté : dépendance supplémentaire non justifiée. `ts.createSourceFile` de
l'API compilateur brute (déjà dépendance via `typescript`) suffit et c'est
déjà la convention posée par `check-dal-reads.ts`.

### Alternative C — Règle ESLint custom
Rejeté : ESLint n'est pas installé dans ce dépôt (aucun `eslint.config.*`).
L'introduire pour ce seul gate serait une dépendance et une config nouvelles
alors qu'un script `tsx` autonome suit la convention déjà en place.

## Amendement (TK-67, 2026-07-08)

`DbError.entity` (variante `not_found`) passe de `z.string()` à
`z.enum(['sejour', 'planning', 'ingredient', 'recette'])` — miroir exact des
émetteurs DAL réels (`sejours.ts`, `plannings.ts`, `ingredients.ts`,
`recettes.ts`). C'est une défense en profondeur orthogonale au gate ci-dessus :
le gate TK-66 empêche l'interpolation *syntaxique* d'un internal en arg 3 ;
l'enum empêche qu'`error.entity` lui-même prenne une valeur hors du set connu,
peu importe le wrapping.

Le libellé humain accentué (`'Séjour'`, `'Recette'`, …) est résolu à la
frontière — `ENTITY_LABELS: Record<Entity, string>` dans
`error-mapping.ts`, exhaustif par le type — jamais stocké dans le type
d'infra `DbError`. `entity` reste un token de code minuscule ; la casse
française est une préoccupation de présentation. Ce choix corrige au passage
un bug latent : le DAL émettait déjà `entity` en minuscule
(ex. `'sejour'`), ce qui produisait `"sejour introuvable"` en prod — le test
`not_found` était un faux vert car il fabriquait `'Séjour'` à la main sans
jamais exercer le DAL. Le wrapping `businessMessage(...)` du point 1
ci-dessus ne change pas : l'interpolation devient un lookup dans
`ENTITY_LABELS`, toujours passé à `businessMessage()`.

## Références
- TK-59 : correction ponctuelle de la fuite (`error-mapping.ts`)
- TK-33/34, ADR-016 : `check-dal-reads.ts`, pattern AST via `typescript` brut
- TK-67 : `DbError.entity` en `z.enum` — défense en profondeur, voir
  amendement ci-dessus
