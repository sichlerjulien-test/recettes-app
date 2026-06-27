import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  _resetSupabaseClientForTests: vi.fn(),
}));
vi.mock('./schema-guard', () => ({
  assertSchema: vi.fn().mockResolvedValue({ ok: true }),
  _resetSchemaGuardForTests: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { assertSchema } from './schema-guard';
import { getAllIngredients, getIngredientById, getAllIngredientsAsMap } from './ingredients';

// ─── Mock Supabase chainable builder ─────────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

function makeChain(result: Promise<MockResult>) {
  return {
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
    select: (_cols?: string) => makeChain(result),
    eq: (_col: string, _val: unknown) => makeChain(result),
    insert: (_rows: unknown) => makeChain(result),
    single: () => result,
    maybeSingle: () => result,
  };
}

function createMockSupabase(tableQueues: Record<string, MockResult[]>): ReturnType<typeof getSupabaseClient> {
  // cast nécessaire : mock partiel — seule from est implémentée, pas l'interface complète
  return {
    from: (table: string) => {
      const queue = tableQueues[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return makeChain(Promise.resolve(next));
    },
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAW_INGREDIENT_ROW = {
  id: 'tomate',
  nom_singulier: 'Tomate',
  nom_pluriel: 'Tomates',
  categorie: 'fruits-legumes',
  unite_base: 'g',
  unite_achat: 'kg',
  conversion: 1000,
  allergenes: [],
  contient_trace: [],
  substituts: [],
  saisonnalite: null,
  notes: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ingredients DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertSchema).mockResolvedValue({ ok: true });
  });

  describe('getAllIngredients', () => {
    it('should return ok with parsed ingredients when DB returns valid rows', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          ingredients: [{ data: [RAW_INGREDIENT_ROW], error: null }],
        }),
      );

      const result = await getAllIngredients();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ingredients).toHaveLength(1);
        expect(result.ingredients[0]?.id).toBe('tomate');
        expect(result.ingredients[0]?.nom_singulier).toBe('Tomate');
      }
    });
  });

  describe('getIngredientById', () => {
    it('should return not_found when row is null', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          ingredients: [{ data: null, error: null }],
        }),
      );

      const result = await getIngredientById('unknown-slug');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('not_found');
        if (result.error.kind === 'not_found') {
          expect(result.error.entity).toBe('ingredient');
          expect(result.error.id).toBe('unknown-slug');
        }
      }
    });
  });

  describe('getAllIngredientsAsMap', () => {
    it('should convert the ingredients array to a Map keyed by id', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          ingredients: [{ data: [RAW_INGREDIENT_ROW], error: null }],
        }),
      );

      const result = await getAllIngredientsAsMap();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ingredients).toBeInstanceOf(Map);
        expect(result.ingredients.size).toBe(1);
        expect(result.ingredients.has('tomate')).toBe(true);
        expect(result.ingredients.get('tomate')?.nom_singulier).toBe('Tomate');
      }
    });
  });
});
