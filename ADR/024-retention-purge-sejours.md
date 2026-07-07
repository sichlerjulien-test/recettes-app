# ADR-024 — Rétention et purge des séjours (pré-auth)

**Statut :** Accepté (2026-07-07)

## Contexte

Les allergènes déclarés sont une donnée de santé (RGPD, catégorie
particulière, art. 9). Aucune durée de conservation n'était définie. Le
produit n'a pas d'authentification : un séjour = un token capability ; une
URL perdue = séjour orphelin, non récupérable par son créateur. Un
`ON DELETE CASCADE` existe déjà sur les tables filles de `sejours`
(`participants`, `plannings`, `feedback` — TK-56a).

## Décision

1. **Suppression = hard delete via `DELETE … CASCADE`.** Pas de soft-delete :
   un flag qui conserve la donnée de santé défait l'objectif RGPD de
   minimisation.

2. **Purge automatique = `pg_cron`**, planifiée dans une migration
   versionnée :
   ```sql
   DELETE FROM sejours WHERE cree_le < now() - interval '60 days';
   ```
   Le `CASCADE` emporte les tables filles.

3. **Ancre de rétention = `cree_le`**, pas `date_fin`. `date_fin` n'est pas
   stocké de façon fiable (`date_debut` est optionnel, `nb_jours` seul ne
   suffit pas à dériver une date de fin absolue). `cree_le` est `NOT NULL
   DEFAULT now()` sur `sejours` — toujours peuplé, jamais nul. `cree_le + 60
   jours` est un proxy robuste, révisable (45 jours si l'on veut serrer),
   documenté ici plutôt que dispersé dans le code.

4. **Vercel Cron rejeté.** Un saut réseau + une fonction serverless pour une
   opération purement DB ajoute une dépendance au quota du plan Hobby
   (terrain mouvant, cf. ADR-023 rejet d'Upstash pour un raisonnement
   analogue). `pg_cron` tourne adjacent à la donnée, dans la même instance
   Postgres que les tables qu'il purge.

## Conséquences

### Positives
- La purge est aussi le seul GC des séjours orphelins (URL perdue, aucun
  moyen de suppression manuelle avant TK-56a).
- Logique de purge versionnée et visible en migration SQL : « règle
  affichée = règle appliquée », pas de job caché dans une console.
- Zéro nouvelle dépendance applicative.

### Négatives
- `pg_cron` doit être activé (`CREATE EXTENSION IF NOT EXISTS pg_cron`) sur
  les deux instances Supabase (dev et prod) — vérifié à l'application de la
  migration, pas avant.
- Rétention fixe (60 jours) sans mécanisme d'exception : un séjour actif
  après 60 jours (utilisation prolongée, ex. long séjour planifié à
  l'avance) est purgé comme n'importe quel autre. Assumé : la fenêtre est
  volontairement généreuse par rapport à la durée d'un séjour typique.

## Alternatives écartées

### Alternative A — Vercel Cron appelant une route API de purge
Rejeté : ajoute un saut réseau et une fonction serverless pour une opération
purement DB, avec dépendance au quota de cron jobs du plan Hobby. `pg_cron`
élimine ce sauté et cette dépendance.

### Alternative B — Soft-delete avec purge différée
Rejeté : conserve la donnée de santé au-delà de sa nécessité, ce que la
suppression est précisément censée éviter (art. 9 RGPD). Un flag
`deleted_at` n'apporte aucun bénéfice ici puisqu'il n'y a pas de compte
utilisateur pour restaurer un séjour supprimé par erreur.

### Alternative C — Ancre `date_fin` calculée
Rejeté : `date_fin` n'est pas une colonne stockée fiable (`date_debut`
optionnel). Calculer une date de fin dérivée pour l'ancrer à la rétention
ajoute de la complexité pour un gain marginal — `cree_le` est toujours
disponible et suffisant comme proxy.

## Références
- TK-56a : endpoint `DELETE /api/sejours/:id`, `ON DELETE CASCADE` sur les
  tables filles
- ADR-023 : rejet d'Upstash pour un raisonnement analogue (pas de nouvelle
  dépendance infra à cette échelle)
- ADR-008 : séparation des instances Supabase (dev/prod), discipline
  d'application des migrations
- ADR-013 : source de vérité schéma DB (canonical.sql, gate schema-replay)
- TK-45 (auth) / TK-46 (historique) : rouvrent cette rétention si des
  comptes persistants entrent en tension avec une purge par âge — à
  retrancher là-bas, pas ici.
