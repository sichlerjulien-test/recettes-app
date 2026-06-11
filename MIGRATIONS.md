# Migrations — runbook

Discipline gravée par ADR-008. À lire avant toute modif de schéma.

## Principe

Deux instances Supabase :
- **dev** — jetable, reconstruite depuis `scripts/migrations/`. Banc d'essai.
- **prod** — vivante. On n'y touche que via une migration committée.

Règle d'or : une migration appliquée est **immuable**. On ne réécrit jamais un fichier
existant, 001 compris. Une correction = une nouvelle migration.

## Écrire une migration

1. Numérotation séquentielle : `scripts/migrations/00N-slug-explicite.sql`. Suivre
   l'entête/gabarit des fichiers existants (lire le dernier en date).
2. Idempotente : `DROP CONSTRAINT IF EXISTS` avant chaque `ADD`. Doit pouvoir se rejouer
   sans casser.
3. Corrigée par une migration suivante, jamais par édition rétroactive.

### Colonne calculée par build-data : utiliser DEFAULT NULL, jamais DEFAULT '{}'

Toute migration ajoutant une colonne dont la valeur est produite par `npm run build-data`
(ex : `exclusions_compatibles`, `allergenes_calcules`) **doit** utiliser `DEFAULT NULL`
et rendre la colonne nullable.

Motif : `DEFAULT '{}'` crée une ambiguïté entre "valeur légitime vide" et "non-matérialisé".
Entre la migration et le premier `build-data`, le filtre lit `{}` et produit un faux
`pool_empty` pour toute exclusion demandée — la recette n'est pas exclue pour une raison
légitime, elle n'a simplement pas encore été calculée. `NULL` est sans ambiguïté.

Le runtime **doit** échouer bruyamment sur `NULL` (erreur explicite nommant la recette
et suggérant `npm run build-data`) — jamais de fallback silencieux vers `[]`. Après un
`build-data` complet, toutes les lignes ont une valeur non-NULL (y compris `[]` pour les
recettes sans aucune exclusion compatible).

Gabarit pour ce type de colonne :

```sql
ALTER TABLE recettes
  ADD COLUMN IF NOT EXISTS ma_colonne_calculee text[] DEFAULT NULL;
-- Pas de NOT NULL : la sentinelle NULL signale que build-data n'a pas encore tourné.
-- Après build-data, toutes les lignes portent une valeur non-NULL.
```

## Appliquer (sens unique dev → prod)

1. **dev d'abord.** SQL Editor dev → coller → Run → zéro erreur.
2. **Valider par re-seed.** `npm run build-data` (pointé dev) doit UPSERT tout le catalogue
   sans erreur. C'est le test qui prouve que le schéma accepte les données réelles.
3. **Smoke test.** `npm run dev` → créer un séjour → générer → ouvrir la liste de courses.
4. **prod ensuite, à l'identique.** Même fichier, SQL Editor prod → Run → zéro erreur.
5. **Prouver la reconstructibilité.**

       pg_dump -s -n public "URI_DEV"  > /tmp/dev.sql
       pg_dump -s -n public "URI_PROD" > /tmp/prod.sql
       diff /tmp/dev.sql /tmp/prod.sql

   Diff vide = clôture. Tolérer uniquement le bruit d'en-tête (SET, commentaires, version
   pg_dump). Toute différence sur CREATE TABLE / CONSTRAINT / INDEX / POLICY / FUNCTION est
   un échec. Fallback sans pg_dump : re-lancer la requête `pg_constraint` sur les deux
   instances et confirmer l'identité — plus faible, aveugle au reste du schéma.

## Interdits

- Éditer un fichier de migration déjà appliqué.
- Modifier le schéma prod en console sans fichier committé derrière.
- Présumer la reconstructibilité sans diff.

## Connexions

URI par instance : Supabase → Settings → Database → Connection string (URI).

## Dette connue

`validate-data` (Zod) ne reflète pas les CHECK SQL (Trou A, ADR-008). Une valeur peut
passer la CI et casser au seed. Tant que les enums SQL et Zod ne sont pas générés d'une
source unique, vérifier manuellement qu'une nouvelle valeur d'enum est ajoutée des deux
côtés. Ticket P2.
