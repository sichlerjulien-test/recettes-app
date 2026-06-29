# ADR-018 — Contrat de retour des RPC transactionnelles : RETURNING la ligne, jamais void

**Statut** : Proposé — fork tranché en faveur de RETURNING, à ratifier.
**Date** : 2026-06-29
**Auteur** : Équipe Meal Planner
**Lié à** : étend ADR-006 (pattern DAL/API, validation Zod des rows, contrat DbError) ·
            s'appuie sur ADR-008 (migration immuable, application manuelle) et
            ADR-013 §3 (canonical.sql régénéré dans la même PR) ·
            débloque TK-10 · ferme TK-09b sous réserve du scope §3.

## Contexte

Le cadrage de TK-10 (createSejour atomique via RPC) a rouvert une question latente que la
formulation backlog masque : quel **contrat de retour** pour les RPC transactionnelles
d'écriture ?

État factuel constaté pendant le cadrage :

- `update_sejour_with_participants` (migration 003) `RETURNS void`. En conséquence,
  `updateSejour` rappelle `getSejourById(id)` après l'RPC pour récupérer l'entité — c'est
  la lecture *load-bearing* diagnostiquée en TK-09b (le séjour et les UUIDs participants
  sont assignés à l'INSERT, impossibles à reconstruire sans SELECT post-écriture).
- `createSejour` est encore non-atomique : deux INSERT séquentiels (sejours puis
  participants) hors transaction, avec un TODO inline assumant le risque d'enregistrement
  orphelin. TK-10 doit le passer en RPC.
- Le backlog demande de construire la RPC create « sur le modèle de update_sejour ». Or ce
  modèle porte précisément le défaut (`void`) qui a fabriqué TK-09b.

## Le fork que la formulation backlog masquait

« RPC transactionnelle sur le modèle de update_sejour » recouvre deux contrats de retour
opposés, à conséquence durable :

- **void** — la RPC est une commande pure. L'appelant qui a besoin de l'entité créée/mise à
  jour (id, token, UUIDs participants) doit faire un SELECT *read-after-write*.
- **RETURNING la ligne complète** — la RPC rend de quoi reconstruire l'entité sans lecture
  supplémentaire. Le DAL ne re-SELECT jamais après écriture.

Copier `void` sur create propage mécaniquement TK-09b côté création : on fabriquerait une
dette jumelle (TK-10b) avant même de merger TK-10. Choisir RETURNING tue la **classe** de
dette à la source, pour create comme pour update — et la réécriture de l'RPC update
déclenche pile le seuil de réouverture inscrit dans TK-09b (« l'update RPC est de toute
façon retouchée par un chantier voisin »), ce qui ferme TK-09b dans le même chantier au
lieu d'une seconde migration isolée plus tard.

Ce choix engage l'architecture au-delà d'un ticket (contrat homogène de toutes les écritures
RPC, discipline migration). Il se tranche par ADR avant cadrage d'exécution, conformément à
la DoR du Project.

## Décision

### 1 — Les RPC transactionnelles d'écriture RETURNENT la ligne canonique, jamais void

Toute RPC qui écrit une entité multi-tables (création/mise à jour de séjour + participants,
et toute future entité de même forme) retourne de quoi reconstruire l'entité complète. `void`
est proscrit pour cette classe de fonctions.

### 2 — Le DAL ne re-SELECT jamais après une écriture RPC

Le DAL mappe et valide Zod la ligne retournée par l'RPC (cohérent avec ADR-006 §3 :
validation systématique des rows au bord DB). Aucune lecture *read-after-write*. La double
lecture « par sécurité » est explicitement exclue : sous ADR-013 le schéma est prouvé, une
re-lecture de contrôle serait vide de sens.

### 3 — Portée immédiate

- `create_sejour_with_participants` : nouvelle migration, RETURNS la ligne. `createSejour`
  devient atomique et sans SELECT post-create. TODO inline supprimé.
- `update_sejour_with_participants` : réécrit en `CREATE OR REPLACE` (nouvelle migration
  numérotée ≥ la suite courante) pour RETOURNER la ligne. `updateSejour` cesse de rappeler
  `getSejourById`. **TK-09b se ferme ici** — à supprimer du backlog à la sortie.
- Hors scope : le `getSejourById` de **pré-check token** dans la route PATCH (concern
  distinct — 403 vs 404). Le folder dans l'RPC est un angle TOCTOU/token séparé, qui reste
  une ligne dormante, pas un élargissement de ce chantier.

### 4 — Forme du retour : choix d'exécution sous contrainte

`RETURNS TABLE`, `SETOF`, ou `jsonb` agrégé est un détail tranché côté Claude Code à la
passe d'implémentation. Contrainte imposée par cet ADR : **une seule structure**,
ré-hydratable et validable Zod par le DAL en un mapping, couvrant séjour + participants. Si
la forme retenue complique le mapping au point de gonfler l'effort d'un cran → STOP, retour
Project.

### 5 — Discipline migration inchangée

Chaque migration RPC régénère `schema/canonical.sql` dans la même PR (ADR-013 §3), gate
vert. Application manuelle dev → validation → prod (ADR-008 §3). `CREATE OR REPLACE`
idempotent ; aucune édition de migration appliquée.

## Conséquences

### Positives

- La classe de dette « void → SELECT read-after-write » est éliminée à la source pour create
  et update, pas rustinée au cas par cas.
- TK-09b se ferme dans le même chantier que TK-10, au lieu d'une 2e migration RPC isolée
  dans six semaines. Le déclencheur de réouverture qu'on a écrit en fermant TK-09b est
  honoré exactement comme prévu.
- `createSejour` atomique du premier coup, sans dette jumelle.
- Contrat homogène : toute future écriture RPC suit la même règle. Plus de décision
  void/RETURNING à re-litiguer à chaque entité.

### Coût assumé

- Deux migrations (création `create_…`, réécriture `update_…`), deux régénérations de
  `canonical.sql`, double application manuelle dev→prod.
- `createSejour` et `updateSejour` changent de forme interne ; tests DAL adaptés — le spy
  RPC asserte désormais une valeur de retour mappée, plus seulement l'absence d'erreur.

### Risque

- Si la réécriture d'`update_sejour_with_participants` révèle un appelant non anticipé que le
  nouveau contrat de retour casse (au-delà de `updateSejour`/`createSejour`), STOP / retour
  Project : fork distinct, pas élargissement (signal TK-02).

## Alternatives écartées

- **void + SELECT read-after-write (statu quo update).** C'est la cause racine de TK-09b.
  La reconduire sur create fabrique TK-10b. Rejetée.
- **Asymétrie : RETURNING sur create, void conservé sur update.** Laisse TK-09b ouverte et
  installe deux contrats divergents pour la même classe de fonction — exactement la
  divergence silencieuse qu'on passe notre temps à tuer (cf. SejourDALInput, TK-09).
  Rejetée.
- **RETURNING mais re-validation par un SELECT séparé « de sécurité ».** Double lecture
  déguisée, vide de sens sous ADR-013 (schéma prouvé en CI). Rejetée.
- **CQRS strict (command/query separation → void).** Argument de pureté : la commande
  n'a pas à rendre l'état. Écarté ici car le coût mesuré (TK-09, double SELECT sur PATCH)
  dépasse le bénéfice théorique, et la ligne retournée est l'entité que l'appelant exige
  systématiquement — séparer fabrique une redondance, pas une clarté.

## Références

- ADR-006 — pattern DAL/API, validation Zod des rows, contrat DbError (étendu ici sur le
  contrat de retour des écritures RPC).
- ADR-008 — migration immuable, application manuelle dev→prod (réaffirmé).
- ADR-013 §3 — `canonical.sql` régénéré dans la même PR que toute migration de schéma.
- `scripts/migrations/003-update-sejour-rpc.sql` — RPC `void`, origine de la dette.
- `src/lib/db/sejours.ts` — `createSejour` non-atomique, `updateSejour` read-after-write.
- TK-10 (débloqué par cet ADR), TK-09b (fermé par §3 sous réserve d'inclure update).
