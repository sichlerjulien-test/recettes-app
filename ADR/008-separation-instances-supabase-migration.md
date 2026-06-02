# ADR-008 — Séparation des instances Supabase et discipline de migration

## Statut
Accepté — Lié à : TK-07, ADR-002 (Zod-first), migration 005

## Contexte

Une seule instance Supabase (ymxqahqrmzerlnyertjf) servait dev et prod. Conséquence :
aucun rail de test schéma. On modifiait la prod, on la re-seedait rarement, et un bug
de schéma latent pouvait dormir indéfiniment faute de reconstruction à froid.

TK-07 a créé une instance dev distincte, reconstruite en rejouant 001→004. Le premier
re-seed a planté : une recette à `equipement: []` était refusée par un CHECK SQL
(`cardinality(equipement) > 0`) présent sur dev. L'investigation a révélé non pas un
mais trois écarts entre les fichiers de migration et la prod réelle, et deux défauts
structurels.

## Le cas d'école 005 (à ne pas oublier)

La dérive était bidirectionnelle, et c'est la preuve :
- Le fichier 001 est EN AVANCE sur prod pour `equipement` : il définit `cardinality > 0`,
  contrainte que la prod n'a jamais portée.
- Le fichier 001 est EN RETARD sur prod pour `ingredient_principal` et `type_cuisine` :
  la prod avait été élargie à la main (valeurs `fruits`, `pain`, `americaine`, `anglaise`)
  sans migration correspondante.

Les deux sens à la fois ne s'expliquent que par une chose : 001 a été édité APRÈS
application. Les migrations n'ont pas été traitées comme immuables.

Deux trous distincts en sont la cause :
- **Trou A — validate-data ne reflète pas les CHECK SQL.** Zod acceptait `equipement: []`
  (CI verte), le CHECK SQL le refusait. Une donnée valide en CI casse au seed. C'est ce
  qui a laissé ce `[]` voyager jusqu'au seed dev. NON résolu par 005 — dette P2.
- **Trou B — les fichiers dérivent dès qu'on touche la prod à la main.** Quelqu'un a
  élargi les CHECK en console, mis Zod à jour, jamais écrit la migration. Le fichier est
  le seul calque resté en retard. C'est exactement la violation que cet ADR existe pour tuer.

Tant que tout le monde tapait la prod partagée, l'écart était invisible. Le rail dev l'a
attrapé au premier re-seed à froid. C'est la valeur de la séparation qui se matérialise,
pas un échec.

## Décision

1. **Deux instances Supabase séparées.** dev est jetable, reconstructible depuis
   scripts/migrations/. prod est l'instance vivante.
2. **Les migrations sont immuables.** Un fichier appliqué ne se réécrit jamais, 001
   compris. Toute correction = nouvelle migration. 005 est le modèle : réconciliation
   idempotente (DROP IF EXISTS → ADD), jamais une retouche de l'historique.
3. **Sens unique dev → validation → prod.** Toute migration s'applique d'abord sur dev,
   se valide par re-seed complet (build-data) + smoke test bout en bout, puis se réplique
   à l'identique sur prod.
4. **Pas d'édition de schéma en console prod sans migration committée derrière.** La
   console exécute une migration versionnée ; elle n'est pas une source de vérité.
5. **La reconstructibilité est vérifiée, pas supposée.** Après toute migration, diff de
   schéma (pg_dump -s -n public) entre dev reconstruit et prod : il doit être vide.

005 grave la réconciliation : drop de `equipement_check`, élargissement des deux enums à
l'état réel de prod, Zod aligné vers le haut (13 valeurs sur `ingredient_principal`,
cf. ADR-002). Diff final dev/prod vide → reconstructibilité rétablie.

## Conséquences

Positif : dev jetable attrape les bugs de schéma tôt ; l'historique de migration redevient
la vérité ; replay 001→N reproduit prod.

Coût : double application manuelle (dev puis prod) tant qu'il n'y a pas de CI de migration
(lien TK-06) ; discipline humaine requise sur l'immuabilité.

Dette résiduelle : Trou A ouvert. 005 a fermé l'instance du symptôme, pas le mécanisme qui
la régénère. Tant que les enums SQL et Zod ne dérivent pas d'une source unique, le même
écart peut renaître. Loggé P2.

## Alternatives écartées

- Réécrire 001 pour refléter la prod : rejeté — détruit l'historique et institutionnalise
  le Trou B.
- Rétrécir la prod (enums à 10) pour matcher le fichier : rejeté — transforme 005 en modif
  de prod, casse le diff vide, appauvrit le modèle de domaine (tofu, fruits-de-mer, agneau
  sont légitimes).
