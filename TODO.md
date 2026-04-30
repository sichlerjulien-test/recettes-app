# TODO — Tests différés

## Test différé : pool filtré vide → erreur explicite côté UI

Issue identifiée par allergen-guard lors de la review du module allergens.

Quand `src/lib/llm/generate-planning.ts` sera implémenté, ajouter un test
d'intégration qui :

1. Construit un `Sejour` avec contraintes saturantes (ex : tous les allergènes EU14 cochés)
2. Appelle la fonction de génération de planning
3. Asserte qu'une erreur **EXPLICITE** est levée (ou un signal de type discriminant
   retourné), **JAMAIS** un planning vide silencieux

Référence ADR-001 : "fallback silencieux interdit, message actionnable obligatoire".

---

## Audit npm — vulnérabilités acceptées (avril 2026)

`npm audit` signale 9 vulnérabilités (4 modérées, 5 hautes), toutes en
dépendances transitives. Décision tranchée : **on n'applique pas de fix
maintenant**.

### Vulnérabilités

1. **postcss < 8.5.10 — XSS via stringify output** (modérée, 4 occurrences)
   - Provenance : `next` → `postcss` (transitif)
   - Risque pratique sur ce projet : nul (Tailwind avec classes
     prédéfinies, aucun CSS user-controlled traité par postcss)

2. **serialize-javascript <= 7.0.4 — RCE via RegExp / DoS via objets**
   (haute, 5 occurrences)
   - Provenance : `@ducanh2912/next-pwa` → `workbox-build` →
     `@rollup/plugin-terser` → `serialize-javascript`
   - Risque pratique sur ce projet : nul (vulnérabilité côté build,
     aucun code externe sérialisé pendant le build Vercel)

### Pourquoi ne pas appliquer le fix maintenant

`npm audit fix --force` propose :
- `next@9.3.3` : régression de Next 16 → Next 9, casse tout le projet
- `@ducanh2912/next-pwa@8.7.1` : régression majeure du package PWA

Coût > bénéfice. On attend que les fixes upstream arrivent naturellement
via les mises à jour de Next.

### Plan de revisite

- Re-vérifier `npm audit` à chaque session de mise à jour de dépendances
- Réévaluer si une vraie CVE exploitable apparaît
- Si un fix non-breaking devient disponible, l'appliquer immédiatement

---

## CI — gap à combler (Sprint 2+)

Le workflow `.github/workflows/validate-data.yml` exécute uniquement
`npm run validate` sur les modifications de `data/**`.
Manquant :

- Pas de workflow qui lance `npm run test` à chaque PR
- Pas de workflow qui lance `npx tsc --noEmit` à chaque PR
- Les 77 tests unitaires actuels ne sont pas vérifiés en CI

**Action** : créer un workflow `.github/workflows/test-and-typecheck.yml`
qui se déclenche sur toute PR vers `main` et exécute les deux commandes.
Pas urgent au MVP (les tests sont lancés manuellement avant chaque PR
via les sub-agents qa-engineer), mais à faire avant ouverture publique.

---

## DAL sejours — risque de cohérence (Sprint 2+)

Dans `src/lib/db/sejours.ts`, la fonction `createSejour` effectue deux INSERT
séquentiels non transactionnels : d'abord le séjour, puis les participants.

Si l'INSERT participants échoue, le séjour reste en base sans participants.
L'API retourne une erreur, mais la donnée partielle est persistée en DB.

**Plan** : durcir avec une RPC transactionnelle Supabase (ou une fonction SQL
`CREATE FUNCTION create_sejour_with_participants(...)`) au Sprint 2+.
Référence : commentaire `TODO(Sprint 2+)` dans `src/lib/db/sejours.ts`.

---

## Dette technique Sprint 1+

### Migration FK manquantes (corrigée en live, à formaliser)

Le SQL `scripts/migrations/001-initial-schema.sql` n'inclut plus les FK
`participants→sejours` et `plannings→sejours` suite au `DROP TABLE sejours CASCADE`
de Session 6. Les FK ont été recréées manuellement via `ALTER TABLE` en
production (Session connexion Supabase).

À faire :
- Soit régénérer `001-initial-schema.sql` depuis l'état Supabase actuel
- Soit ajouter une migration `002-restore-foreign-keys.sql` qui recrée
  explicitement `participants_sejour_id_fkey` et `plannings_sejour_id_fkey`

### Extraction de buildFilterConstraintsFromSejour

La construction de `FilterConstraints` depuis un `sejour` (lignes 46-57 de
`src/app/api/sejours/[id]/planning/route.ts`) doit migrer dans
`src/lib/allergens/filter.ts` pour éviter la logique métier inline dans les routes.

### Logger applicatif injectable

Aujourd'hui pas de log structuré applicatif. À introduire au Sprint 2
si besoin de debug en prod (le pattern peut être inspiré du `LLMClient`
injectable du module `llm/`).

---

### UI - Erreurs DB silencieuses sur /sejour/[id]

`src/app/sejour/[id]/page.tsx` convertit les erreurs `query_failed` et
`row_validation_failed` du DAL plannings en `initialPlanning = null`.
L'utilisateur voit "Aucun planning généré" sans distinction entre
"pas encore généré" et "erreur de chargement".
À Sprint 2 : ajouter un état d'erreur UI explicite (toast au mount via
`useEffect` côté client, ou Suspense + error boundary).

### Tests UI

Aucun test automatisé sur les pages `/nouveau-sejour` et `/sejour/[id]`
au MVP. Couverture actuelle : tests d'intégration manuels via curl
(8 cas validés en Session connexion Supabase).
À Sprint 2 : Playwright pour tests end-to-end ou Vitest + Testing Library
pour tests unitaires composants.

### Optimisation chargement catalogue recettes

`src/app/sejour/[id]/page.tsx` charge le catalogue COMPLET de recettes
à chaque vue, alors que seules les recettes du planning sont nécessaires.
Acceptable à 10 recettes, structurant à 500.
À Sprint 2+ : faire une jointure SQL ou un fetch ciblé par `recette_id`
des entries.

---

## Dette technique LLM (Sprint 1+)

### Génération du tool input_schema depuis Zod

`COMPOSE_PLANNING_TOOL` dans `src/lib/llm/client.ts` duplique partiellement
`LLMPlanningOutputSchema`. Risque de divergence si l'un évolue sans l'autre.

Solution future : utiliser une lib type `zod-to-json-schema` pour générer
`input_schema` depuis `LLMPlanningOutputSchema` au runtime.

Pas urgent au MVP : les deux sont colocalisés dans `client.ts`, le risque
de divergence est faible.

### Bug d'arrondi des unités d'achat (visible utilisateur)

`buildShoppingList` ne fait pas `Math.ceil` après conversion vers
`unite_achat`, ce qui produit des affichages absurdes côté UI :
- "0.3 piece Chou-fleur" (devrait être 1 piece)
- "0.5 piece Lait de coco" (devrait être 1 piece)
- "0.5 botte Coriandre fraîche" (devrait être 1 botte)

Cause : pour `chou-fleur`, `unite_base=g, unite_achat=piece, conversion=800`.
Une recette consomme 240g → conversion 240/800 = 0.3 piece.

Fix attendu : si l'unité finale est discrète (piece, boîte, sachet, botte,
cube, gousse), faire Math.ceil(quantite_convertie). Pour les unités continues
(g, kg, ml, l), garder la conversion fractionnaire.

Priorité : avant ouverture test interne. Très visible côté utilisateur.
