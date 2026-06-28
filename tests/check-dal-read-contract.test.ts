import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractStringAccesses, checkAccesses } from '../scripts/check-dal-read-contract';

const RECETTES_SRC = readFileSync(join(process.cwd(), 'src/lib/db/recettes.ts'), 'utf8');
const INGREDIENTS_SRC = readFileSync(join(process.cwd(), 'src/lib/db/ingredients.ts'), 'utf8');

function mergeAccesses(...sources: Array<Map<string, Set<string>>>): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  for (const src of sources) {
    for (const [func, keys] of src) {
      let s = merged.get(func);
      if (!s) { s = new Set(); merged.set(func, s); }
      for (const k of keys) s.add(k);
    }
  }
  return merged;
}

describe('check-dal-read-contract', () => {
  it('(a) état actuel — notes inclus dans le contrat → 0 violation', () => {
    const accesses = mergeAccesses(
      extractStringAccesses(RECETTES_SRC, 'recettes.ts'),
      extractStringAccesses(INGREDIENTS_SRC, 'ingredients.ts'),
    );
    expect(checkAccesses(accesses)).toHaveLength(0);
  });

  it("(b) row['fake'] dans mapRecetteRow → violation recettes.fake", () => {
    const source = `
      function mapRecetteRow(item: unknown): unknown {
        const row = item as Record<string, unknown>;
        return { id: row['id'], bad: row['fake'] };
      }
    `;
    const violations = checkAccesses(extractStringAccesses(source));
    expect(violations).toContain('recettes.fake');
  });

  it("(c) row['fake'] dans mapIngredientRow → violation ingredients.fake (verrouille branche A)", () => {
    const source = `
      function mapIngredientRow(item: unknown): unknown {
        const row = item as Record<string, unknown>;
        return { id: row['id'], bad: row['fake'] };
      }
    `;
    const violations = checkAccesses(extractStringAccesses(source));
    expect(violations).toContain('ingredients.fake');
  });

  it("(d) row['recette_ingredients'] dans mapRecetteRow ne produit pas de faux positif", () => {
    const source = `
      function mapRecetteRow(item: unknown): unknown {
        const row = item as Record<string, unknown>;
        const rawIngredients = row['recette_ingredients'];
        return { id: row['id'] };
      }
    `;
    const violations = checkAccesses(extractStringAccesses(source));
    expect(violations).toHaveLength(0);
  });
});
