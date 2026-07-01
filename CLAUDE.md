@AGENTS.md

> **npm audit** — Ne pas appliquer `npm audit fix --force` : les correctifs actuels régressent Next.js (→9.x) ou `@ducanh2912/next-pwa`. Réévaluer à chaque mise à jour de dépendances.

# Gate de cadrage — entrée d'exécution (leçon TK-02)

Avant d'écrire la moindre ligne sur un ticket :
1. Vérifier la présence des trois éléments : critères testables, hypothèse de
   localisation, effort. Absent → STOP, le ticket retourne au Project.
2. Vérifier via `git log --grep <TK-id> origin/main` que le ticket n'est pas déjà
   partiellement ou totalement livré sur main AVANT de cadrer. Un ticket à moitié
   fait sur main invalide toute l'hypothèse de localisation (leçon TK-47).
3. CONFIRMER l'hypothèse de localisation par une passe de lecture cheap (grep/read)
   AVANT toute écriture. L'hypothèse est un pari, pas une vérité.
   - Confirmée → exécuter.
   - Falsifiée (le défaut est ailleurs) → STOP. Ne pas réparer à l'aveugle.
     Reporter la vraie localisation ; retour Project pour re-cadrage.
4. Effort réel qui dépasse l'estimation d'un cran (S→M, M→L) → signal que la
   localisation était fausse (cf. TK-02). STOP, ne pas pousser au travers.
5. Fork d'approche structurel non tranché = STOP, même si l'hypothèse de localisation
   paraît complète. Ne pas choisir l'approche à la place du Project. Router vers
   architect + ADR ; le ticket retourne au Project.
6. Un commit `test(TK-xx)` qui achève une sous-tâche doit rayer cette sous-tâche dans
   le corps du ticket (issue GitHub) dans le même commit — pas après, pas dans un
   commit séparé. Si la sous-tâche n'est pas rayée, la clôture est incomplète.

# Convention de référencement ticket ↔ PR (ADR-020)

À l'ouverture d'une PR, poser exactement un label `TK-XX` (ou `no-ticket` si hors ticket). Commit poussé directement sur main hors PR : trailer `Refs: TK-XX` obligatoire.

# Gate de clôture de session

Clôture de session : `npm run end-session` doit afficher OK avant de fermer la conversation. Échec = session non close.
