#!/usr/bin/env bash
# scripts/end-session.sh — gate de clôture de session (hygiène git locale).
# Constate l'état d'atterrissage. Ne touche à rien. Échec = session non close.
set -euo pipefail

MAIN="main"
PR_OPEN=0
[ "${1:-}" = "--pr-open" ] && PR_OPEN=1
fail=0
note() { echo "      -> $1"; }

# Refs distantes à jour, sinon comparaison sur refs périmées = faux vert.
git fetch --quiet origin "$MAIN" || { echo "KO  git fetch a échoué (réseau / origin)"; exit 1; }

# 1. Working tree propre.
if [ -n "$(git status --porcelain)" ]; then
  echo "KO  working tree non propre"; note "git status, puis commit ou stash"; fail=1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"

if [ "$PR_OPEN" -eq 1 ]; then
  # PR ouverte : on exige seulement que la branche soit poussée.
  if ! git rev-parse --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    echo "KO  branche '$branch' sans upstream (non poussée)"; note "git push -u origin $branch"; fail=1
  elif [ -n "$(git log '@{u}..HEAD' --oneline)" ]; then
    echo "KO  commits locaux non poussés sur '$branch'"; note "git push"; fail=1
  fi
else
  # Standard : tout a atterri sur main.
  if [ "$branch" != "$MAIN" ]; then
    echo "KO  HEAD sur '$branch', pas sur '$MAIN'"
    note "git switch $MAIN   (--pr-open si la PR n'est pas encore mergée)"; fail=1
  fi
  if [ "$(git rev-parse "$MAIN")" != "$(git rev-parse "origin/$MAIN")" ]; then
    echo "KO  '$MAIN' non aligné sur 'origin/$MAIN'"; note "git pull --ff-only"; fail=1
  fi
  merged="$(git branch --merged "$MAIN" --format='%(refname:short)' | grep -vx "$MAIN" || true)"
  if [ -n "$merged" ]; then
    echo "KO  branches mergées non supprimées :"; echo "$merged" | sed 's/^/      /'
    note "git branch -d <branche>"; fail=1
  fi
fi

[ "$fail" -ne 0 ] && { echo ""; echo "Session NON close."; exit 1; }
echo "OK  session propre — tu peux clore."
