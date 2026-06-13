# ADR-012 — Garde-fou de synchronisation CLAUDE_PROJECT.md (sentinelle hash + CI)

**Statut** : Accepté  
**Date** : 2026-06-13  
**Auteur** : Équipe recettes-app  
**Décideurs** : Project  

---

## Contexte

`CLAUDE_PROJECT.md` (racine du repo) est la **source de vérité** du document stratégique projet. Le champ "Instructions" du Project Claude.ai en est une copie aval, collée à la main — aucune API n'existe pour automatiser ce push vers l'UI Claude.ai.

La règle précédente ("recopier dans le même flux") était une règle de volonté : elle cassait silencieusement dès qu'on oubliait. Aucun filet de sécurité n'empêchait de merger une modification sans recollage.

---

## Décision

On remplace la règle de volonté par une **sentinelle de hash gardée par la CI**.

### Principe

- `scripts/project-sync/last-synced.sha256` stocke le SHA-256 (hex, UTF-8 brut, sans normalisation) du dernier `CLAUDE_PROJECT.md` dont on a confirmé le collage dans l'UI.
- La CI vérifie à chaque PR que le hash courant du fichier correspond à la sentinelle.
- La mise à jour de la sentinelle n'est possible qu'en passant par `npm run sync:project`, qui affiche le contenu intégral et exige une confirmation explicite `y` avant d'écrire.

### Composants

| Fichier | Rôle |
|---|---|
| `scripts/project-sync/hash.ts` | Fonctions pures `computeHash` / `isSynced` (aucun I/O) |
| `scripts/project-sync/check.ts` | Script CI non-interactif (`npm run check:project-sync`) |
| `scripts/project-sync/sync.ts` | Script interactif de confirmation (`npm run sync:project`) |
| `scripts/project-sync/last-synced.sha256` | Sentinelle versionnée |
| `.github/workflows/ci.yml` (job `project-sync`) | Gate CI bloquant |

### Flux de travail

1. On édite `CLAUDE_PROJECT.md` dans le repo.
2. On lance `npm run sync:project` → le contenu s'affiche → on le colle dans l'UI → on répond `y`.
3. La sentinelle est mise à jour. On commit les deux fichiers ensemble.
4. La CI vérifie : `npm run check:project-sync` → `exit 0` si match, `exit 1` sinon.

---

## Limite assumée

La CI ne vérifie **pas** que le collage dans l'UI a réellement eu lieu — elle vérifie uniquement qu'une confirmation explicite a été donnée via le script interactif. Faute d'API Projects Claude.ai, c'est la seule vérification mécanisable.

Cette limite est connue et assumée : elle transforme une règle de volonté invisible en un geste explicite tracé dans l'historique git.

---

## Conséquences

- **Positive** : Impossible de merger une modification de `CLAUDE_PROJECT.md` sans avoir mis à jour la sentinelle et donc donné une confirmation explicite.
- **Positive** : Les fonctions de hash sont pures et testées par Vitest (stabilité, détection de mismatch, cas sentinelle absente).
- **Neutre** : Le collage dans l'UI reste manuel — la CI ne peut pas vérifier l'état de l'UI Claude.ai.
- **Négative** : Un acteur malveillant pourrait répondre `y` sans coller. C'est un garde-fou contre l'oubli, pas contre la fraude intentionnelle.

---

## Alternatives rejetées

- **Hook pre-commit** : ne protège pas les merges directs sur main ni les PR en CI-only.
- **Script de vérification dans `end-session`** : périmètre trop étroit (session locale uniquement), ne bloque pas la CI.
- **Intégration directe avec l'API Claude.ai** : l'API Projects n'existe pas à ce jour.
