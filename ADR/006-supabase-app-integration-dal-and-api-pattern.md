# ADR-006 — Connexion Supabase côté app, DAL et pattern d'API

**Statut** : Accepté
**Date** : 2026-04-28
**Auteur** : Équipe Meal Planner
**Décideurs** : Tous les membres du projet

## Contexte

Sprint 0 a posé le schéma Supabase et les scripts d'alimentation (ADR-003).
Sprint 1 a ajouté les modules métier purs (allergens, llm, shopping).

Il reste à connecter ces modules à l'app Next.js : client Supabase,
couche d'accès aux données, routes API, validation input, format d'erreur,
gestion d'authentification.

Cet ADR documente les choix structurants de cette intégration.

## Décisions

### 1. Client Supabase server-only au MVP

Au MVP sans authentification, toutes les requêtes DB transitent par
des Route Handlers Next.js (App Router). Le browser n'appelle jamais
Supabase directement.

- Un seul client : src/lib/db/supabase.ts
- Initialisation lazy en singleton
- Utilise SUPABASE_SERVICE_ROLE_KEY (bypass RLS)
- Marqué "server-only" via le module 'server-only' de Next.js (empêche
  l'import accidentel côté client)

Pas de client browser créé au MVP. Sera ajouté au Sprint 2+ si besoin
de Realtime ou de queries directes côté client.

### 2. Data Access Layer (DAL) dédié

Toutes les requêtes Supabase sont encapsulées dans src/lib/db/<entity>.ts.
Les Route Handlers n'écrivent jamais de SQL ni d'appel direct au client
Supabase.

Structure :
- src/lib/db/supabase.ts : singleton client
- src/lib/db/ingredients.ts : getAllIngredients, getIngredientById
- src/lib/db/recettes.ts : getAllRecettes, getRecetteById
- src/lib/db/sejours.ts : createSejour, getSejourById, getSejourByToken
- src/lib/db/plannings.ts : createPlanning, getPlanningBySejourId

Bénéfices :
- Couplage faible entre routes et DB
- Tests unitaires plus simples (mock du DAL, pas de Supabase)
- Migration future vers un autre provider sans toucher les routes
- Cohérence avec le découplage déjà en place sur lib/allergens, lib/shopping

### 3. Validation Zod systématique sur les rows DB

Chaque fonction du DAL parse les rows Supabase via le schéma Zod
correspondant avant de les retourner.

Exemple :
```ts
const { data, error } = await supabase.from('recettes').select('*');
if (error) return { ok: false, error: { kind: 'db_error', cause: error.message } };
const parsed = z.array(RecetteSchema).safeParse(data);
if (!parsed.success) return { ok: false, error: { kind: 'db_error', cause: 'Invalid row shape' } };
return { ok: true, recettes: parsed.data };
```

Justification : si une migration DB rate ou si Supabase évolue, on
échoue tôt et bruyamment au lieu de propager du undefined dans la
logique métier.

### 4. Validation Zod systématique sur les inputs API

Chaque Route Handler valide le body de la requête via un schéma Zod
au tout début du traitement. Échec → réponse 400 avec les erreurs Zod
détaillées dans le champ `error.details`.

Pattern :
```ts
const body = await request.json();
const parsed = CreateSejourBodySchema.safeParse(body);
if (!parsed.success) {
  return Response.json({
    error: { kind: 'validation_failed', message: '...', details: parsed.error.flatten() }
  }, { status: 400 });
}
```

### 5. Format d'erreur API unifié

Toutes les erreurs API suivent ce format :

```ts
{
  error: {
    kind: 'validation_failed' | 'db_error' | 'business_error' | 'llm_unavailable' | 'not_found' | 'unauthorized',
    message: string,        // actionnable, en français
    details?: unknown        // optionnel, pour debug
  }
}
```

Codes HTTP associés :
- validation_failed : 400
- unauthorized : 401
- not_found : 404
- business_error : 422 (sémantiquement valide mais impossible à traiter)
- db_error : 500
- llm_unavailable : 503

Exception documentée : la route GET /api/health retourne 503
(Service Unavailable) au lieu de 500 quand Supabase est indisponible.
503 est sémantiquement plus juste pour un health check (l'infrastructure
est temporairement indisponible, à réessayer), et c'est l'usage standard
des outils de monitoring qui interrogent les health endpoints.

Note : le `kind` côté API est distinct du `kind` interne des modules
métier. La route fait le mapping, mais sans tout aplatir : pool_empty est
promu kind API de première classe (422, porte details.cause), distinct de
business_error, car le client doit le discriminer et différencier le
message allergène/exclusion.

Amendement (TK-59) — deux règles pour le body d'erreur. (A) Échec de
validation d'input appelant (Zod) : message générique, détail dans
`details` (flatten). (B) Erreur interne serveur (validation de ligne DB,
dérive de schéma, indisponibilité LLM) : message générique, aucun détail
dans le body, cause loggée côté serveur.

### 6. Routes API au MVP de la Session

5 routes implémentées au MVP :

- GET /api/health : sanity check connexion Supabase
- POST /api/sejours : crée un séjour avec participants et paramètres,
  retourne { id, token }
- POST /api/sejours/:id/planning : génère un planning pour un séjour
  existant (vérification token via header X-Sejour-Token)
- GET /api/sejours/:id/planning : récupère le dernier planning persisté
  d'un séjour (vérification token via header X-Sejour-Token, 404 si
  aucun planning n'a encore été généré)
- POST /api/sejours/:id/shopping-list : calcule la liste de courses à
  partir du planning courant (vérification token via header
  X-Sejour-Token, 422 si aucun planning généré)
- DELETE /api/sejours/:id : supprime le séjour et ses données liées
  (participants, plannings, feedback via ON DELETE CASCADE — TK-56a),
  vérification token via header X-Sejour-Token, 404 si séjour introuvable,
  204 en cas de succès

### 7. Authentification au MVP : token de séjour

Aucune authentification utilisateur au MVP. Le contrôle d'accès se fait
par le token UUID v4 généré à la création du séjour.

- POST /api/sejours retourne { id, token } dans la réponse
- Toute route qui modifie ou consulte un séjour exige le token via
  le header HTTP X-Sejour-Token
- Si token absent ou invalide : 401 unauthorized
- Le token est un droit de lecture **et** d'écriture : il autorise aussi
  bien la consultation (GET) que la modification (PATCH) et la suppression
  définitive du séjour (DELETE — TK-56a). Il n'existe pas de niveau de
  droit intermédiaire au MVP ; quiconque détient le token peut supprimer le
  séjour. (TK-57)

Le token est généré par crypto.randomUUID() (cryptographiquement aléatoire,
non énumérable).

Sera remplacé par Supabase Auth au Sprint 2+ pour des comptes utilisateurs
persistants.

## Conséquences

### Positives
- Séparation claire app / DAL / DB
- Validation Zod en entrée et sortie de DAL : confiance maximale
- Format d'erreur unifié : UI peut traiter toutes les erreurs uniformément
- Pas de couplage browser → Supabase au MVP : surface d'attaque minimale
- Migration vers Supabase Auth simple (juste remplacer le check de token)

### Négatives
- Latence : tout passe par les Route Handlers, pas d'appel direct
  client → Supabase. Acceptable au MVP (pas de besoin Realtime).
- Token UUID dans l'URL/header : si l'URL est partagée publiquement
  (ex: copié-collé sur Twitter), le séjour devient accessible. Risque
  acceptable pour un produit où l'URL EST le mécanisme de partage assumé.

### Neutres
- DAL ajoute ~5 fichiers : compromis lisibilité vs concision

## Alternatives écartées

### Alternative A — Pas de DAL, queries inline dans les routes
Plus rapide à coder au début, mais mélange logique métier et accès DB,
duplique les parses Zod, complique les tests. Refusée.

### Alternative B — Client Supabase aussi côté browser
Permettrait Realtime et latence réduite. Hors-scope MVP, ajoute la
complexité de gérer 2 contextes (auth, RLS différentes). À reconsidérer
au Sprint 2+ si Realtime devient un vrai besoin.

### Alternative C — Authentification dès le MVP
Supabase Auth est mature mais ajoute un module entier (signup, login,
magic link, recovery, etc.). Inadapté au MVP qui vise "zero friction"
(URL = identité du séjour, partageable).

### Alternative D — ORM (Drizzle, Prisma, Kysely)
Pour un MVP avec 6 tables et requêtes simples, ORM = code en plus,
build step en plus, dépendance en plus, pour zéro bénéfice. À
reconsidérer si requêtes complexes (joins multiples, agrégats SQL).

## Critères de revue

Cette décision sera réévaluée si :
- Besoin de Realtime (ajouter client browser)
- Besoin de comptes utilisateurs persistants (ajouter Supabase Auth)
- Latence des Route Handlers devient bloquante (envisager edge runtime
  ou cache)
- Plus de 15 tables DB (ORM peut devenir rentable)

## Références
- ADR-003 : schéma Supabase et RLS
- ADR-005 : pattern Result-like
- Next.js App Router : https://nextjs.org/docs/app
- Supabase server-only patterns : https://supabase.com/docs/guides/auth/server-side
