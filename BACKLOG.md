# Meal Planner — Backlog

> Backlog vivant : À faire + Dormant uniquement. Tout ticket clos (Fait/Annulé)
> est archivé de façon append-only dans `BACKLOG_ARCHIVE.md`, jamais réédité —
> mapping TK→PR déjà mécanisé par ADR-020 (label PR) + git, donc la seule
> source de vérité du **statut** est le tableau « Vue d'ensemble » ci-dessous ;
> la prose ne porte plus aucun marqueur de statut. Convention actée par
> ADR-026 (supersede la convention du 2026-07-01 qui gardait les lignes Fait).
> Convention effort : S (<1h) / M (~demi-journée) / L (~1 journée) / XL (plusieurs jours).

---

## Ordre conseillé

VS quasi-close — reliquat TK-61 / TK-62 (cosmétiques, différables). Prochain
vrai fork : V3 = décision auth (TK-45) [ADR, session dédiée], qui débloque
TK-46 / TK-47 / monétisation. Confort V3 orthogonal (TK-08, TK-14, TK-48)
shippable sans auth. Dormants inchangés (seuils de réveil).

---

## Tickets ouverts (détail)

### TK-17 — Seed upsert-only : purge des orphelins  ·  S/M
**Origine :** observé pendant l'incident (sans le causer — total restait à 166).

`build-data` upsert sur `onConflict: 'id'` et ne supprime jamais. Si un id quitte le YAML, l'ancienne ligne reste orpheline en base indéfiniment. Trou structurel, pas un bug actif aujourd'hui.

Sous-tâches :
- Option A : seed "YAML = vérité", supprime en base ce qui n'y est plus (attention FK `recette_ingredients`).
- Option B : job de détection des orphelins (alerte, pas suppression auto).

**Critères :** aucun ingrédient/recette hors-YAML ne subsiste après seed, ou détection explicite. Priorité basse, candidat V2.

### TK-20 — [DORMANT] Réouverture conditionnelle du garde catégorie porc/viande-rouge/alcool
**Origine :** ADR-011 §9 (amendé 2026-06-11). Requalifié de tâche en déclencheur de réouverture.

NE PART PAS EN EXÉCUTION en l'état. L'approche que ce ticket décrivait — scinder
`viandes-poissons` + garde déterministe grade-allergène sur `sans-porc`/`sans-viande-rouge`/
`sans-alcool` — a été explicitement REJETÉE par ADR-011 §9, pour deux raisons :
  1. Blast radius : scinder la catégorie touche le calcul végé/vegan qui lit la catégorie
     coarse (logique déjà extraite et testée).
  2. Sur-calibrage de sévérité : imposer une garantie grade-allergène à une exclusion dont
     l'erreur gâche un repas (pas l'hôpital) = la confusion de catégories qu'ADR-001 interdit,
     en sens inverse.

Déjà livré à la place (régime 2, « curation tracée », enforced en CI) : `TRIAGE_PORC` /
`TRIAGE_VIANDE_ROUGE` / `TRIAGE_ALCOOL` dans `scripts/ingredient-exclusion-completeness.ts`,
tests discriminants, invariant croisé tag→catégorie. Le « enforced au build » est donc déjà
acquis ; seul le « sans qualification manuelle » est délibérément non fait.

**Seuils de réouverture (un seul suffit) :**
  - le catalogue grossit au point que la curation manuelle n'est plus fiable, OU
  - une erreur d'exclusion non-allergène atteint un utilisateur en conditions réelles.

Tant qu'aucun seuil n'est franchi (état actuel : ~11 ingrédients triés, zéro signalement
terrain), la curation tracée tient et il n'y a rien à exécuter. Si un seuil tombe : rouvrir
ADR-011 §9 avec la donnée, ne pas pousser ce ticket tel quel.

**Résidu connexe, hors TK-20 :** limite volaille (un poulet mal catégorisé reste à tort
végétarien sans déclencher l'invariant croisé). Fix candidat documenté : champ
`nature: animal|vegetal`. Choix structurant → architect + amendement ADR avant tout cadrage.
Risque de cohérence végé (gâche un repas), pas de sûreté allergène. Faible priorité.

### TK-37 — [DORMANT] Politique de merge unique sur main (squash-only)
**Origine :** cadrage TK-31 (ADR-020) · constat terrain 2026-07-01.

NE PART PAS EN EXÉCUTION en l'état. ADR-020 a rendu le gate backlog v2
merge-agnostique (il lit PR→label via l'API GitHub, indifférent à squash/merge/
rebase). Squash-only n'est donc requis par aucun mécanisme : son seul bénéfice est
l'homogénéité de l'historique de `main`. Or cette homogénéité ne sert qu'un
multi-contributeur, un `git bisect` inter-feature, ou un tooling qui parse
`git log` — valeur nulle en solo mono-machine. Le coût symétrique (granularité
intra-feature perdue au squash) est tout aussi théorique dans ce contexte. On
trancherait un fork à deux plateaux vides. Décision réversible de surcroît (un
toggle de réglage GitHub) : rien à figer d'avance.

Déjà en place : branch protection active (PR obligatoire + 4 checks), pushs directs
sur `main` interdits. Le résidu ouvert n'est QUE la désactivation de merge-commit +
rebase. Non fait délibérément, pas oublié.

**Seuils de réouverture (un seul suffit) :**
  - un 2e contributeur rejoint le repo (l'homogénéité d'historique acquiert une
    valeur réelle), OU
  - le double oracle d'ADR-020 (API PR + trailers des commits directs) devient un
    coût palpable, OU
  - l'historique mixte de `main` gêne concrètement une opération réelle (bisect,
    archéologie git) — pas « ce serait plus net ».

État actuel : solo, mono-machine, aucun seuil franchi. Tant qu'aucun ne tombe, il
n'y a rien à exécuter. Si un seuil tombe : ouvrir un ADR dédié (squash-only vs
statu quo) avec la donnée déclenchante — ne pas pousser ce ticket tel quel.

### TK-35 — [DORMANT] canonical.sql : génération pg_dump déterministe cross-machine
**Origine :** clôture TK-10. schema-replay rouge sur PR #54, cause non traitée.

`schema/canonical.sql` est un `pg_dump` brut (ADR-013 §3). Sa forme dépend de la version de
pg_dump qui le génère : Homebrew/Mac trie les fonctions par OID de création + 2 lignes vides
avant `ALTER FUNCTION` (CREATE OR REPLACE sans DROP) ; Ubuntu/pgdg (la CI) trie
alphabétiquement + 1 ligne vide. Le replay CI diff contre canonical → rouge purement
cosmétique, sans rapport avec le schéma. En TK-10, régénéré à la main pour matcher la CI.
La cause demeure : le prochain dump depuis un Mac reproduit l'écart.

Décision active : on absorbe à la main (solo, mono-machine — douleur latente, pas active).
Choix explicite, PAS un oubli.

NE PART PAS EN EXÉCUTION en l'état — porte un fork structurant à trancher avant cadrage :
  - Normaliser le dump (tri + whitespace avant diff) redéfinit ce que canonical.sql EST :
    il cesse d'être un pg_dump brut → amendement ADR-013 §3 (on touche l'oracle de diff).
  - Figer la version pg_dump (conteneur de génération) ne touche pas l'oracle, contraint sa
    production (tout contributeur génère via le conteneur) → conséquence opérationnelle.
Les deux voies divergent sur ce qu'on sanctuarise → architect + ADR (vraisemblablement
amendement ADR-013), pas un choix d'exécutant. Penchant courant : conteneur > normalisation
(ne pas glisser une couche de traitement entre la réalité et l'oracle qui a fermé l'incident
500).

Réouverture (un seul suffit) : 2e contributeur sur OS différent · changement de ta machine
ou de version pg_dump locale · prochaine divergence replay non liée au schéma réel.

### TK-53 — Micro-cleanup assertion cross-device restoSlots · XS
`generatePlanning.mock.calls[0]![6]` dans `route.test.ts` : remplacer l'index nu par une assertion nommée ou une destructuration — le commentaire `// index 6 = restoSlots` est en place, l'index reste fragile à une évolution de signature.

### TK-52 — Test RTL empty-state du picker frappe un chemin mort · S
Le test empty-state de PlanningSection mocke { ok:true, status:200, candidates:[] } —
réponse que le serveur ne produit jamais (422 dès candidates.length===0). Il ne passe
que via un guard défensif `if (list.length===0)` ; le vrai chemin `res.status===422 →
no_alternative` n'a aucune assertion RTL. Corriger le mock en 422 quand le picker est
retouché ; au passage, trancher si le guard mort reste ou saute. Test qui verrouille
une branche morte = fausse confiance, à corriger opportunistement, pas urgent.

### TK-63 — Même flash overlay/formulaire sur le flow de régénération · XS

**Origine :** cadrage TK-51 (2026-07-06) — même pattern repéré en lisant le code.

`EditSejourClient.tsx::generatePlanning()` reproduit exactement le bug de TK-51 :
`router.push(...)` appelé en corps de `try`, puis `finally { setIsGenerating(false) }`
qui lève l'overlay avant que la navigation aboutisse. Même cause, autre fichier.

Différable : ce n'est pas le moment-clé décrit par TK-51 (payoff de création), c'est
le flow de régénération depuis l'édition — moins de visibilité, moins de fréquence
d'usage. Zéro impact sûreté, comme TK-51.

**Critères :** mêmes que TK-51 côté overlay ↔ navigation, transposés à ce fichier.

> Si le fix de TK-51 se généralise proprement (ex. un hook partagé `useNavigateAfterAction`
> qui ne lève jamais l'overlay avant démontage), TK-63 peut se fermer par simple
> réutilisation — à évaluer au cadrage de TK-63, pas maintenant.

### Tickets une-ligne (à rédiger quand tirés, pas maintenant)

- **[DORMANT] TK-55b** — Rate limiting per-IP. Différé lors de TK-55 (ADR-023) : le plafond par séjour protège la disponibilité, pas le martèlement multi-séjours d'un même visiteur. Seuil de réveil : cap console Anthropic effectivement approché, OU martèlement visible en logs.
- **[DORMANT, ADR-gated] TK-60b** — CSP stricte nonce-based (vraie défense anti-XSS). TK-60a n'a posé qu'une CSP `'unsafe-inline'` (durcissement en profondeur, ne bloque pas un `<script>` injecté). Le nonce force du rendu dynamique + interaction avec le service worker PWA — décision structurante, ADR requis (architect) avant cadrage. Réveil : incident XSS réel, ou refonte touchant le rendu statique/PWA.
- **TK-61** — Remplacer l'icône fourchette placeholder par un vrai logo de marque. Cosmétique, réversible, différable.
- **TK-62** — Hex de marque dupliqué en 3 endroits (globals.css --primary / manifest.json / layout.tsx) sans gate de synchro. Même famille que le Trou A. Dériver de --primary au build ou poser une sentinelle. Inerte tant que la couleur ne bouge pas.
- **TK-64** — Gate schema-replay aveugle au cron.* : no-op silencieux (image CI sans pg_cron + psql sans -v ON_ERROR_STOP=1), le gate ne peut pas échouer sur du SQL cron — 015 et 016 sont passées vertes sans que leur syntaxe cron soit validée en CI. [ADR probable : installer pg_cron en CI vs faire échouer explicitement sur cron non exécutable]. Réveil : prochaine migration cron.
- **[DORMANT, à valider] TK-68** — not_found sur ingredient/recette : 404 user-facing ou défaut d'intégrité (→ 500) ? Orthogonal à TK-67 (typage/casse, pas taxonomie). NE PAS CADRER avant d'avoir lu les call sites `ingredients.ts:114` / `recettes.ts:153` : si les deux ne sont atteints que par lookup interne (jamais par une URL que Sarah provoque), alors le 404 est le mauvais statut → ticket ; sinon → poubelle. Réveil : prochaine fois qu'on touche `error-mapping.ts` ou ces deux DAL.
- **[DORMANT] TK-72** — Aucun harnais E2E adossé à une DB seedée pour les flows qui exigent un séjour réel (édition, régénération, régénération partielle TK-41…). Constat né du cadrage TK-63 : son critère E2E a été sauté à raison (l'astuce "UUID inexistant → not-found" de TK-51 ne transpose pas à une page qui doit lire un vrai séjour), ce qui laisse ces flows couverts seulement par des assertions RTL sur le mécanisme (ex. `setIsGenerating` pas appelé), jamais sur l'observable réel (formulaire pas visible avant destination) — un refactor qui réintroduirait un flash par un autre mécanisme passerait ces tests. Réveil : un 2e flow édition/régénération réclame une couverture comportementale end-to-end.

---

## V2 — Hors MVP

### TK-28 — [DORMANT] Chargement ciblé du catalogue recettes · V2
Page séjour charge le catalogue complet (prémisse NON revérifiée — à confirmer côté code
au réveil). Fix : jointure SQL / fetch par `recette_id`. Purement perf, zéro impact
correction/sûreté.

Seuil de réveil (un seul suffit) :
  - catalogue > ~100 recettes, OU
  - latence page séjour ressentie en conditions réelles.
En-dessous, sans objet — le catalogue fait quelques dizaines de recettes.

NE PAS CADRER tant que le seuil n'est pas franchi. Au réveil, passe cheap d'abord :
confirmer que la page charge encore le catalogue complet — le fix peut déjà être caduc.

### TK-40b — [DORMANT] Distinguer « profondeur insuffisante » de l'échec de cohérence [ADR]
**Origine :** cadrage post-TK-40a (2026-07-02).

NE PART PAS EN EXÉCUTION. La jambe `pool_empty` (pool vide post-filtre, cause
allergène/exclusion, messages actionnables distincts) est livrée et testée
(route.ts + e2e/exclusions.spec.ts). Seul reste ouvert le diagnostic « profondeur
insuffisante » : pool non vide mais trop peu profond pour un séjour cohérent —
aujourd'hui absorbé dans `validation_failed_after_retries` (message générique).

TK-40a a mesuré : profil Sarah (cœliaque + végétarien, 7j) → catalogue tient. Ce
chemin d'échec ne tire pas pour le persona de référence. Le construire maintenant
= spéculatif.

**Seuil de réveil (l'un ou l'autre) :**
- un séjour réel produit un `validation_failed_after_retries` dont le post-mortem
  montre un pool structurellement trop peu profond (le message générique conseille
  alors mal l'utilisateur) ;
- on élargit les profils supportés au-delà de cœliaque + végétarien → re-lancer
  d'abord le diagnostic TK-40a sur le nouveau profil, ne pas construire à l'aveugle.

**Au réveil, ADR d'abord — mais pas le faux binaire du ticket d'origine** (oracle
pré-LLM vs classifieur post-retry). Vraie question : la sonde de faisabilité
peut-elle réutiliser `src/lib/coherence/` sans forker sa logique (2e source de
vérité) ? Si non, arbitrer heuristique post-retry vs renoncement.

---

## VS — Sécurité

> Origine : audit sécurité 2026-07-03. VS-bloquant = à faire avant tout élargissement d'audience au-delà du cercle de test.

---

## V3

### TK-08 — Optimisation réutilisation des ingrédients entre recettes
**Origine :** feedback 9 · point C validé (report assumé).

Orienter le choix des recettes pour que les ingrédients entamés soient réutilisés (le chou-fleur acheté entier mais à moitié utilisé sert ailleurs). Problème d'optimisation combinatoire — terrain à hallucinations LLM, à ne pas mélanger avec la réparation du moteur (TK-01). La part récupérable (affichage du surplus) est déjà adressée gratuitement par TK-02.

### TK-14 — Règles de cohérence sémantiques restantes
**Origine :** hors-scope assumé d'ADR-009 · report V2 décidé après le merge de l'extraction · reclassé V3 (2026-07-01) : le séjour d'août ne requiert pas cette règle.

Structure journalière, non-répétition de recette et unicité de l'ingrédient principal/jour
sont faites (TK-01) et désormais isolées dans `src/lib/coherence/`. Reste la variété des
types de cuisine sur le séjour — listée comme règle dure en §4 de CLAUDE_PROJECT.md mais
jamais implémentée. Reportée V3 : son absence dégrade le confort (séjour monotone), pas la
sûreté ni la cohérence structurelle.

Hors de ce ticket : le respect de l'équipement est déjà garanti par le filtre pré-LLM
(pas de four sans four). Le "backstop équipement" post-LLM évoqué en hors-scope d'ADR-009
n'est qu'une redondance ceinture+bretelles, pas une règle manquante — ne pas le confondre
avec un trou.

### TK-45 — Auth / comptes [ADR]
Auth / comptes. [ADR] Lié au store/monétisation ; renverse la décision no-auth (§5). Ne pas ouvrir avant.

### TK-46 — Historique des séjours (server-side)
Historique des séjours (server-side). Dépend de TK-45.

### TK-47 — Packaging store iOS/Android (TWA / wrapper)
Premier step obligatoire : vérif install Android sur appareil réel (rendu de l'icône sur launcher adaptatif). Hérité non vérifié de TK-44 (validé desktop uniquement, faute d'appareil).

Packaging store iOS/Android (TWA / wrapper).

### TK-48 — Pondération des portions pour enfants
Scaling uniforme actuel = sur-achat.

**Curation lourde persona cœliaque + végétarien** — conditionnelle au résultat de TK-40a.

---

## V4

### TK-49 — Plafond de fréquence sur exclusions
Plafond de fréquence sur exclusions (ex : viande rouge max 1×/sem). Objet distinct d'une exclusion binaire.

### TK-50 — Présence partielle par repas
Convives variables par créneau.

**Non ticketés :**
- Stratégie pricing + publication store (session dédiée).
- Sync multi-appareils / multi-contributeur.

---

## Scope écarté

- **UX « construire le planning plat par plat »** (version XL de l'idée 2) : écartée. On corrige un planning existant (TK-41), on ne le bâtit pas créneau par créneau.

---

## Hors backlog — va dans les instructions du Project

**Feedback 10** (philosophie "bonne bouffe entre copains") : critère de curation des recettes, intégré à CLAUDE_PROJECT.md. Pas un ticket.

---

## Vue d'ensemble

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| TK-08 | Réutilisation ingrédients | V3 | — | À faire |
| TK-14 | Règles de cohérence sémantiques restantes | V3 | — | À faire |
| TK-17 | Seed : purge des orphelins | P2 | S/M | À faire |
| TK-20 | [DORMANT] Réouverture conditionnelle garde porc/viande-rouge/alcool | P2 | — | Dormant |
| TK-28 | [DORMANT] Chargement ciblé du catalogue recettes | V2 | — | Dormant |
| TK-35 | [DORMANT] canonical.sql génération pg_dump déterministe | P2 | — | Dormant |
| TK-37 | [DORMANT] Politique de merge unique sur main (squash-only) | P2 | — | Dormant |
| TK-40b | [DORMANT] Distinguer « profondeur insuffisante » de l'échec de cohérence [ADR] | V2 | — | Dormant |
| TK-45 | Auth / comptes [ADR] | V3 | — | À faire |
| TK-46 | Historique des séjours (server-side) | V3 | — | À faire |
| TK-47 | Packaging store iOS/Android (TWA / wrapper) | V3 | — | À faire |
| TK-48 | Pondération des portions pour enfants | V3 | — | À faire |
| TK-49 | Plafond de fréquence sur exclusions | V4 | — | À faire |
| TK-50 | Présence partielle par repas | V4 | — | À faire |
| TK-52 | Test RTL empty-state picker (chemin mort) | P2 | S | À faire |
| TK-53 | Micro-cleanup assertion cross-device restoSlots (index nu) | P2 | XS | À faire |
| TK-55b | [DORMANT] Rate limiting per-IP | VS | — | Dormant |
| TK-60b | [DORMANT] CSP stricte nonce-based (ADR requis) | VS | — | Dormant |
| TK-61 | Remplacer l'icône fourchette placeholder par un vrai logo | VS | — | À faire |
| TK-62 | Hex de marque dupliqué (globals.css / manifest.json / layout.tsx) | VS | — | À faire |
| TK-63 | Même flash overlay/formulaire sur régénération (EditSejourClient) | P2 | XS | À faire |
| TK-64 | Gate schema-replay aveugle au cron.* | P2 | — | À faire |
| TK-68 | [DORMANT] not_found ingredient/recette : 404 user-facing ou défaut d'intégrité (→ 500) ? | P2 | — | Dormant |
