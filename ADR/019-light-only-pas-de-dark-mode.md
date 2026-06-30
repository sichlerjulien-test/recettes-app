# ADR-019 — Light-only assumé, dark mode hors-scope

**Date :** 2026-07-01  
**Statut :** Accepté

## Décision

L'application est rendue uniquement en thème clair, quel que soit le réglage OS de l'utilisateur. Le dark mode est explicitement hors-scope.

## Implémentation

- `@custom-variant dark (&:is(.dark *))` dans `globals.css` : les classes `dark:` des composants shadcn ne s'activent qu'avec la classe `.dark` sur un ancêtre — classe jamais posée.
- `color-scheme: light` dans `:root` (CSS) + `style={{ colorScheme: "light" }}` sur `<html>` (inline) + export `viewport` Next.js → triple signal au navigateur et aux UA.
- `manifest.json` déjà cohérent : `background_color: "#ffffff"`, `theme_color: "#16a34a"`.

## Justification

Le catalogue de recettes et la palette de couleurs n'ont jamais été pensés pour le dark mode. Poser des tokens dark propres représente un effort non justifié par la priorité produit actuelle. Forcer light-only est plus honnête que de laisser des tokens dark partiels et incohérents.

## Conséquences

- Les classes `dark:` héritées de shadcn restent dans les fichiers générés mais sont inertes.
- Un test Playwright (`e2e/dark-mode.spec.ts`) régresse si le mécanisme est cassé.
- Décision réversible : supprimer `@custom-variant dark (&:is(.dark *))` et poser `.dark` sur `<html>` suffit à rouvrir le dark mode.
