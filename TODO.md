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
