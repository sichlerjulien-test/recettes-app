# Meal Planner — Index des agents de revue

> **RÈGLE — À LIRE AVANT TOUTE ÉDITION**
> - **Source de vérité des prompts = `.claude/agents/<nom>.md`**, dans le repo.
> - Ce fichier est un index de navigation. Il ne contient aucun texte de prompt.
> - **Ne jamais recopier un prompt ici.** Si le prompt évolue, on édite `.claude/agents/<nom>.md`.
> - Pour invoquer un agent dans Claude Code : `Agent(subagent_type="<nom>")`.
> - Pour invoquer manuellement dans Claude.ai chat : ouvrir `.claude/agents/<nom>.md` et coller le contenu.

---

## Tableau récapitulatif

| Agent | Quand l'invoquer | Autorité | Prompt canonique |
|---|---|---|---|
| **architect** | AVANT toute introduction de nouveau type métier, dépendance externe, schéma DB, contrat API, ou pattern architectural réutilisé à grande échelle | Blocage absolu | [.claude/agents/architect.md](.claude/agents/architect.md) |
| **allergen-guard** | Sur toute modification touchant `src/lib/allergens/`, `data/ingredients/`, ou les prompts LLM de génération de planning | All-or-nothing | [.claude/agents/allergen-guard.md](.claude/agents/allergen-guard.md) |
| **qa-engineer** | APRÈS une session d'implémentation, AVANT de merger une PR | Approbation intégrale ou refus | [.claude/agents/qa-engineer.md](.claude/agents/qa-engineer.md) |

**Ne pas invoquer architect** pour : CSS, bug fixes, code applicatif standard.
**Ne pas invoquer allergen-guard** pour : toute autre modification hors du périmètre ci-dessus.
**Ne pas invoquer qa-engineer** pour : questions d'architecture ou de sécurité allergènes (rôles distincts).
