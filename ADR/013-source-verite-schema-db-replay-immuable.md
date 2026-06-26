# ADR-013 — Source de vérité unique du schéma DB : replay immuable + référence canonique + gate de reconstructibilité

**Statut** : Accepté — fork validé (Modèle B). Le diff terrain ne conditionne pas cette décision ; il détermine seulement le contenu de la migration de réconciliation (cf. §Risque).
**Date** : 2026-06-16
**Auteur** : Équipe Meal Planner
**Lié à** : TK-15 · réaffirme ADR-008 · étend ADR-010 (gate CI) · cousin de TK-16, TK-13

## Contexte

### Déclencheur

Incident 500 sur `/shopping-list`. Cause racine : aucune exécution des migrations du repo
ne reproduit le schéma courant from scratch. Dev et prod ont dérivé parce que des
changements de schéma ont été appliqués hors système de migration (console, `ALTER`
manuels). Le repo ne sait pas reconstruire l'état réel. Tant que ce socle manque,
l'incident se rejoue à la prochaine divergence.

### Pourquoi un ADR et pas un simple ticket

TK-15 cache un fork à conséquence durable que la formulation backlog masque : « baseline
capturant le schéma » peut désigner deux modèles opposés. Ce choix se tranche par ADR
avant tout cadrage d'exécution (DoR du Project). Cet ADR le tranche.

### État factuel à corriger (constaté pendant le cadrage)

- TK-06 est **clos** (ADR-010). Le « séquencer avec TK-06 » du backlog est périmé : TK-15
  étend le gate existant, il n'attend rien.
- Le hint backlog « régénérer les FK dans `001` ou ajouter `002-restore-foreign-keys.sql` »
  est doublement mort : éditer `001` viole ADR-008 ; `002` est déjà pris
  (`002-rename-brunch-to-petit-dejeuner.sql`).
- Le `001` committé **contient déjà** les FK `participants→sejours` et `plannings→sejours`
  inline. La prémisse du ticket est donc soit périmée, soit le signe d'une ré-édition de
  `001` (Trou B). À établir par diff terrain, pas par supposition.

## Décision

### 1 — La source de vérité reste la séquence de migrations immuable rejouable

Réaffirmation d'ADR-008. Le schéma canonique est ce que produit le replay `001→N` sur une
instance vierge. **Pas de squash. Pas de réécriture de `001`.** Une migration appliquée ne
se réécrit jamais.

### 2 — La dérive live est réconciliée par UNE migration idempotente en bout de chaîne

Tout écart entre le replay et l'état réel (FK manquantes, colonnes/enums hors-fichier) est
corrigé par une **nouvelle** migration numérotée à la suite (≥ `010`), sur le pattern 005
(`DROP … IF EXISTS` → `ADD`, rejouable). Jamais par édition d'un fichier appliqué. Le
contenu exact est déterminé par le diff terrain, pas présupposé ici.

### 3 — Artefact de référence canonique committé

Un fichier `schema/canonical.sql` (sortie `pg_dump -s -n public` d'une instance vierge
après replay complet) est committé. C'est l'**oracle de diff**, pas un fichier appliqué.
Règle dure : toute migration de schéma régénère `schema/canonical.sql` dans la même PR.
Le gate (§4) refuse une PR qui modifie une migration sans régénérer la référence — sinon
l'oracle pourrit.

### 4 — Gate de reconstructibilité en CI (4e job, étend ADR-010)

Un job rejoue `001→N` sur un Postgres jetable (conteneur CI) et diff la sortie contre
`schema/canonical.sql`. Diff non vide (hors bruit d'en-tête) = rouge, merge bloqué. Job
nommé séparément (granularité Rulesets, cf. ADR-010 §2).

### 5 — Pas de runner ni de table `schema_migrations`

Refusé comme sur-ingénierie. 9 migrations appliquées à la main sur 2 instances ne
justifient pas un framework de migration ni un journal d'application. La convergence se
**prouve par diff**, conformément à ADR-008, pas par un ledger. L'application reste
manuelle dev → validation → prod (ADR-008 §3).

### 6 — Discipline gravée

Tout changement de schéma = une migration committée, appliquée à TOUS les environnements,
référence canonique régénérée, gate vert. Fin du SQL console hors-migration — déjà posé
par ADR-008 §4, ici rendu **vérifiable mécaniquement** et non plus seulement conventionnel.

## Conséquences

### Positives

- Ferme l'outage prod à la racine : une divergence schéma redevient impossible à merger
  silencieusement.
- Renforce ADR-008 au lieu de le contourner : l'immuabilité de l'historique est préservée,
  la reconstructibilité passe de « vérifiée à la main » à « imposée par la CI ».
- Le 4e job ferme le trou que ADR-008 §Conséquences signalait comme dette (« double
  application manuelle tant qu'il n'y a pas de CI de migration »).

### Coût

- Un job CI de plus (un `psql` replay + un `diff` sur conteneur éphémère ; négligeable).
- `schema/canonical.sql` doit être régénéré à chaque migration de schéma. Le gate l'impose,
  donc le coût est porté par l'outillage, pas par la vigilance humaine.

### Risque / inconnu

- L'ampleur de la dérive prod est **inconnue jusqu'au diff à trois voies** (dump prod,
  dump dev, replay vierge). Si elle dépasse la seule question des FK, la migration de
  réconciliation grossit et l'effort gonfle d'un cran → signal TK-02 : STOP, retour Project
  pour re-cadrage. Cet ADR ne présuppose pas le résultat.

## Alternatives écartées

- **Squash / baseline qui remplace l'historique** (`000-baseline.sql`, 001→009 archivés) :
  rejeté. C'est le Trou B (édition d'historique) à l'échelle maximale — exactement la
  violation qu'ADR-008 existe pour tuer. Économiser une migration ne vaut pas détruire la
  décision d'archi la plus chèrement acquise.
- **Runner + table `schema_migrations`** : rejeté. Sur-ingénierie pour l'échelle réelle ;
  collision avec la discipline manuelle dev → prod d'ADR-008.
- **Régénérer les FK dans `001` / ajouter `002-restore-foreign-keys.sql`** : impossible.
  `001` immuable, `002` déjà pris. Toute réconciliation va en `010+`.

## Note posture RLS catalogue

`canonical.sql` encode `ENABLE ROW LEVEL SECURITY` sans aucune policy sur `ingredients`,
`recette_ingredients` et `recettes`. C'est une posture consciente : l'app accède via la clé
`service_role` côté serveur, qui contourne le RLS. Ces tables ne sont pas protégées en
pratique — ne pas interpréter `ENABLE ROW LEVEL SECURITY` comme une garantie d'isolation.

## Références

- ADR-008 — séparation des instances Supabase et discipline de migration (réaffirmé)
- ADR-010 — gate CI trois jobs (étendu par le 4e job §4)
- MIGRATIONS.md — runbook d'application
- `scripts/migrations/001`→`010` — historique immuable
- TK-15 (backlog), TK-16 (gate déploiement DB↔code, cousin)
- `docs/incidents/500-shopping-list.md` — post-mortem de l'incident déclencheur
