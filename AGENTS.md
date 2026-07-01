<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ci-gate-rules -->
# Gate CI et TypeScript (TK-06)

Le check TypeScript repo-wide utilise `tsc --noEmit`, **pas** `next build`.
`next build` ignore les fichiers `tests/` non importés par l'app — c'est exactement le trou qui a laissé passer l'épisode `validatePlanning` (signature 4 → 3 args, test forteresse type-cassé invisible à Vitest).

**Pour tous les agents :**
- `npm run test` vert ≠ preuve de compilation. Seul `tsc --noEmit` repo-wide en est une.
- Le check TypeScript de qa-engineer (`check #2`) est figé sur `npx tsc --noEmit` — jamais `next build`, jamais `tsc` restreint à `src/`.
- Le gate CI (.github/workflows/ci.yml) impose trois required status checks indépendants : `typecheck`, `test`, `validate`. Les trois doivent être verts pour un merge.
<!-- END:ci-gate-rules -->

<!-- BEGIN:test-setup-rules -->
# Convention harnais de test — setup global vs mock file-local

Polyfills d'environnement jsdom (ResizeObserver, etc.) → `tests/vitest.setup.ts` via `setupFiles` global.
`vi.mock(module)` → jamais en `setupFiles` (s'appliquerait à toute la suite) : reste file-local. Extraire un helper partagé seulement au 2ᵉ consommateur.
<!-- END:test-setup-rules -->
