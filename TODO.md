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
