# ADR-001 — Séparation LLM / Validateur déterministe pour les allergies

**Statut** : Accepté
**Date** : 2026-04-21
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

---

## Contexte

Le produit Meal Planner est destiné à organiser les repas d'un groupe en séjour. Sa promesse-clé, **non négociable**, est : *zéro erreur sur les allergies*. Une seule erreur (ex : un plat contenant du gluten servi à une personne cœliaque) peut avoir des conséquences sérieuses sur la santé d'un utilisateur et détruire totalement la confiance dans le produit.

La génération du planning de repas pourrait techniquement être confiée intégralement à un LLM (Claude). Cependant, les LLM, par leur nature probabiliste, peuvent halluciner ou ignorer une contrainte sous pression de tokens, même avec des instructions très strictes dans le prompt système. Il est documenté que cette défaillance se produit dans des cas non négligeables, sans signal clair au moment de la génération.

Confier la sécurité allergènes à un LLM seul est donc incompatible avec la promesse-produit.

## Décision

Nous adoptons une architecture en **4 étages** pour la génération de planning :

### Étage 1 — Filtre déterministe pré-LLM
Implémenté dans `src/lib/allergens/filter.ts`. Cette fonction prend en entrée le catalogue complet des recettes et les contraintes du séjour (allergies déclarées, régimes, équipement disponible). Elle retourne un sous-ensemble de recettes garanties sûres : aucune ne contient d'allergène déclaré, aucune n'enfreint un régime, aucune ne nécessite un équipement absent.

### Étage 2 — LLM avec pool restreint
Implémenté dans `src/lib/llm/generate-planning.ts`. Le LLM reçoit en entrée :
- Le pool filtré de recettes (uniquement leurs identifiants, noms, et métadonnées de cohérence)
- Le contexte du séjour (durée, répartition des repas, nombre de participants)
- Les règles de cohérence (variété protéines, équilibre des féculents, etc.)

Le LLM **ne reçoit jamais** la liste des allergies des participants. Cette information ne fait pas partie de son contexte, donc il ne peut pas la violer.

Le LLM doit produire un JSON strict listant les `recette_id` choisis. Il ne peut **pas inventer** de recette : tous ses choix sont contraints au pool fourni.

### Étage 3 — Validateur déterministe post-LLM
Implémenté dans `src/lib/allergens/validator.ts`. Le planning produit par le LLM est re-vérifié contre les allergies déclarées. En cas de violation détectée :
1. Logger l'incident avec contexte complet (audit)
2. Retry de la génération (max 2 fois)
3. Si échec persistant après MAX_ATTEMPTS (3 tentatives) : retourner une
   erreur métier explicite (validation_failed_after_retries) avec les
   dernières violations détectées. Le caller (UI) affichera un message
   actionnable proposant de relancer ou de modifier les contraintes.
   Décision révisée (Session 7) : le fallback "recettes secours" envisagé
   initialement n'a pas été implémenté. Au MVP, toutes les recettes du
   catalogue sont par construction des "recettes secours" (10 recettes
   curées pour servir de socle). Si le pipeline filter+LLM+validator
   échoue, c'est un signal de bug à investiguer, pas un cas à masquer
   par un fallback.

### Étage 4 — Liste de courses 100% déterministe
Aucun LLM dans `src/lib/shopping/build-list.ts`. La liste est calculée par agrégation directe des ingrédients du planning, ajustée au nombre de portions.

## Conséquences

### Positives

- **Garantie technique sur la promesse-clé.** Même en cas de défaillance LLM, la sécurité allergènes est préservée par construction.
- **Limite l'exposition aux hallucinations.** Le LLM ne peut faire que des erreurs de cohérence (variété, équilibre), jamais des erreurs de sécurité.
- **Liste de courses fiable par construction.** Aucune source d'erreur probabiliste sur le calcul des quantités.
- **Auditabilité.** Chaque planning conserve la trace des contraintes utilisées pour sa génération.
- **Découplage.** Le module LLM peut être remplacé (autre modèle, autre fournisseur) sans toucher à la sécurité allergènes.

### Négatives

- **Catalogue limité au MVP.** Le LLM ne peut pas inventer de recette à la volée. Toutes les recettes proposées doivent exister dans la base curée. C'est un coût de curation initial significatif (50 recettes + 300 ingrédients à curer manuellement).
- **Pool potentiellement vide.** Sur des combinaisons d'allergies très restrictives (ex : cœliaque + vegan + sans fruits à coque + sans soja), le pool filtré peut devenir vide. L'application doit gérer ce cas explicitement avec un message actionnable, sans tentative de contournement.
- **Coût de maintenance de la base.** Toute évolution du catalogue passe par un process de curation humaine. Compensé par la qualité produit, mais à assumer dans la durée.

## Alternatives écartées

### Alternative A — LLM seul avec prompt strict
*Description :* faire confiance au LLM en lui passant la liste des allergies et en l'instruisant de ne pas en utiliser.
*Rejetée :* insuffisant. Les hallucinations sont documentées même avec instructions strictes. Aucune garantie technique. Incompatible avec la promesse non-négociable.

### Alternative B — Double LLM (génération + validation par un second LLM)
*Description :* un LLM génère, un autre vérifie.
*Rejetée :* ajoute du coût (2x les tokens), du non-déterminisme, et de la latence. Ne résout pas le problème de fond : le second LLM peut aussi halluciner. Un validateur déterministe est plus simple, plus rapide, et garanti.

### Alternative C — Catalogue généré dynamiquement par LLM
*Description :* laisser le LLM proposer des recettes inventées à la volée, taggées par lui.
*Rejetée :* combine les pires défauts : hallucinations sur la composition des recettes ET sur les tags allergènes. Aucune façon de garantir la sécurité.

### Alternative D — API recettes externe (Spoonacular, Edamam)
*Description :* déléguer la base recettes à un fournisseur externe.
*Rejetée comme source de vérité allergènes :* dépendance critique sur la fiabilité du fournisseur, que nous ne maîtrisons pas. Pourrait être utilisée plus tard en complément (enrichissement, inspiration), jamais comme source de vérité pour les allergies.

## Critères de revue

Cette décision sera réévaluée si :
- Un nouveau modèle LLM offre des garanties formelles sur le respect de contraintes (peu probable à court terme)
- Le coût de curation de la base devient un blocker majeur de croissance (à mesurer empiriquement après MVP)
- Un cas d'usage métier émerge qui nécessite la génération de recettes à la volée (à challenger durement avant d'accepter)

## Références

- Documentation Anthropic sur la fiabilité des contraintes : https://docs.claude.com/
- Règlement INCO (UE) n°1169/2011, annexe II — liste EU14
- Module d'implémentation : `src/lib/allergens/`
