# ADR-004 — Module LLM de génération de planning

**Statut** : Accepté
**Date** : 2026-04-26
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet
**Amendé partiellement par** : ADR-009 (2026-06-03)

## Contexte

Le MVP doit générer un planning de repas à partir d'un séjour configuré
(participants, contraintes, paramètres). L'ADR-001 a posé l'architecture
en 4 étages (filtre → LLM → validateur → liste de courses) pour garantir
la promesse "zéro erreur sur les allergies".

Cet ADR détaille les décisions concrètes du module LLM : modèle utilisé,
format d'I/O, gestion des erreurs, coût attendu, stratégie de tests.

## Décisions

### Modèle utilisé : Claude Sonnet (dernier)

Le module utilise claude-sonnet-4-6 (ou plus récent à la date de
développement). Sonnet est le bon compromis qualité/coût pour cette tâche
de composition contrainte. Opus serait surdimensionné, Haiku risque
d'être moins fiable sur le respect des contraintes de cohérence.

### Format de sortie : Tool use (function calling)

Le LLM ne génère pas de JSON en texte libre. Il appelle un "tool"
défini avec un input_schema strict. L'API Anthropic garantit que la
réponse respecte ce schéma JSON.

Avantages :
- Pas de parsing fragile (backticks markdown, commentaires, etc.)
- Validation côté API Anthropic
- Meilleure fiabilité documentée pour les sorties structurées

### Format d'entrée : pool filtré sans allergènes

Conformément à ADR-001, le LLM ne reçoit JAMAIS :
- La liste des allergies des participants
- La liste des régimes
- Les noms des participants

Le LLM reçoit uniquement :
- Pool filtré de recettes : id, nom, type_repas, type_cuisine,
  ingredient_principal, feculent_dominant, duree_active
- Contexte séjour : nb_jours, répartition (midis/soirs/brunchs),
  niveau_cuisine, temps_disponible
- Règles de cohérence (dans le system prompt) : pas deux fois la même
  recette, pas deux fois la même protéine par jour, respect du temps si
  "rapide", variété des types de cuisine

La sécurité allergènes est garantie par filter.ts en amont (pool déjà
safe) et validator.ts en aval (re-vérification).

### Gestion des erreurs

Trois cas explicites :

1. **Pool vide** (filterRecipes retourne 0 recettes utilisables)
   - Pas d'appel LLM
   - Erreur métier explicite : PoolEmptyError
   - Le caller affichera un message actionnable à l'utilisateur

2. **Validateur détecte une violation post-LLM**
   - Retry max 2 fois (le LLM peut avoir un comportement non déterministe
     même avec température basse)
   - Si 3 échecs consécutifs : retourner ValidationFailedError avec les
     violations. Pas de fallback automatique au MVP — voir ADR-001 pour
     la justification.

3. **API Anthropic indisponible ou timeout**
   - Timeout côté client : 15 secondes
   - Retry 1 fois géré par le SDK Anthropic (backoff interne, configuré
     via maxRetries: 1 sur le client)
   - Si échec persistant : LLMUnavailableError avec message actionnable

### Coût et latence

- 1 appel : ~3000 tokens input + 500 tokens output ≈ 0.02€
- Latence cible : <10s (typiquement 3-6s avec Sonnet)
- Pas de cache au MVP : chaque génération est unique aux contraintes

### Placement du module

src/lib/llm/ (déjà créé vide). Couplage minimal :
- Importe Recette, MealType depuis lib/types/domain
- Appelle filterRecipes (lib/allergens/filter)
- Appelle validatePlanning (lib/allergens/validator)

Pas d'autre dépendance.

### Stratégie de tests

- Tests unitaires : mock de l'API Anthropic via une factory injectable.
  Rapides, déterministes, exécutés en CI à chaque PR.
- 1 test d'intégration appelant vraiment l'API : exclus de la CI par
  défaut (suffix .integration.test.ts ou variable d'env), à lancer
  manuellement avant les merges majeurs touchant le module LLM.

## Conséquences

### Positives
- Format de sortie fiable par construction (tool use)
- Sécurité allergènes garantie par défense en profondeur (filter+validator)
- Coût maîtrisé (~0.02€/génération, 5€ couvrent ~250 générations dev)
- Tests rapides via mock, sans dépendance réseau

### Négatives
- Dépendance forte à l'API Anthropic : pas de plan B en cas
  d'indisponibilité prolongée (acceptable au MVP)
- Latence client perçue (3-10s) : à mitiger côté UI avec un loader
  explicite
- Test d'intégration coûte 0.02€ par run : à invoquer avec parcimonie

### Neutres
- Pas de cache : si problème de latence ou de coût émerge, à
  reconsidérer (caching par signature de contraintes)

## Alternatives écartées

### Alternative A — Génération de texte libre + parse JSON
Plus flexible mais fragile (backticks, commentaires, hallucinations
sur le format). Tool use est plus fiable.

### Alternative B — Modèle Haiku ou plus petit
Moins cher (~5x) mais qualité de respect des contraintes documentée
comme inférieure. Pas le bon trade-off pour la fonction critique.

### Alternative C — Cache des plannings par hash de contraintes
Optimisation prématurée. Chaque séjour a des contraintes uniques en
pratique. À reconsidérer si métriques le justifient.

### Alternative D — Fournisseur LLM tiers (OpenAI, Mistral, etc.)
Pas de gain technique. Anthropic Claude est aligné avec la stack
projet (Anthropic produit aussi Claude Code utilisé pour le dev).

## Critères de revue

Cette décision sera réévaluée si :
- Le coût agrégé dépasse 50€/mois (à mesurer post-MVP)
- Latence perçue cliente bloque l'usage (<3s requis)
- Un nouveau modèle Anthropic offre un meilleur ratio qualité/coût
- Un cas d'usage métier nécessite une génération non contrainte par
  un catalogue (peu probable)

## Références
- ADR-001 : architecture de validation allergènes
- Anthropic tool use docs : https://docs.claude.com/en/docs/build-with-claude/tool-use
- CLAUDE.md règles 3.1 (allergies) et 3.4 (UX)

---

## Amendements

### ADR-009 (2026-06-03) — Séparation du validateur de cohérence

**Section "Placement du module" — couplage minimal**
L'énoncé "Pas d'autre dépendance" est caduc. `generatePlanning` dépend
désormais aussi de `lib/coherence/` (en plus de `lib/allergens/filter` et
`lib/allergens/validator`). La validation post-LLM passe d'un validateur
unique à deux validateurs en séquence : `validatePlanning` (sécurité) puis
`validateCoherence` (cohérence).

**Section "Gestion des erreurs" — cas 2 (violation post-LLM)**
Le retry ne se déclenche plus sur "toute violation post-LLM" mais sur
**(violation sécurité) OU (violation cohérence `'bloquant'`)**. Les violations
de sévérité `'qualite'` n'entraînent pas de retry : elles sont renvoyées
comme avertissements (`warnings?`) sur un planning retourné en succès
(`ok: true`).
