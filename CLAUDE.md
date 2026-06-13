@AGENTS.md

> **npm audit** — Ne pas appliquer `npm audit fix --force` : les correctifs actuels régressent Next.js (→9.x) ou `@ducanh2912/next-pwa`. Réévaluer à chaque mise à jour de dépendances.

# Gate de cadrage — entrée d'exécution (leçon TK-02)

Avant d'écrire la moindre ligne sur un ticket :
1. Vérifier la présence des trois éléments : critères testables, hypothèse de
   localisation, effort. Absent → STOP, le ticket retourne au Project.
2. CONFIRMER l'hypothèse de localisation par une passe de lecture cheap (grep/read)
   AVANT toute écriture. L'hypothèse est un pari, pas une vérité.
   - Confirmée → exécuter.
   - Falsifiée (le défaut est ailleurs) → STOP. Ne pas réparer à l'aveugle.
     Reporter la vraie localisation ; retour Project pour re-cadrage.
3. Effort réel qui dépasse l'estimation d'un cran (S→M, M→L) → signal que la
   localisation était fausse (cf. TK-02). STOP, ne pas pousser au travers.
