import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  _resetSupabaseClientForTests: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { createPlanning } from './plannings';
import type { CreatePlanningInput } from './plannings';

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

function createMockSupabase(tableQueues: Record<string, MockResult[]>) {
  return {
    from: (table: string) => {
      const queue = tableQueues[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return makeChain(Promise.resolve(next));
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLANNING_INPUT: CreatePlanningInput = {
  sejour_id: 'sejour-uuid',
  entries: [{ jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
  contraintes_utilisees: {
    allergenes: [],
    regimes: [],
    equipement: ['four'],
  },
};

const RAW_PLANNING_ROW = {
  id: 'planning-uuid',
  sejour_id: 'sejour-uuid',
  entries: [{ jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
  contraintes_utilisees: {
    allergenes: [],
    regimes: [],
    equipement: ['four'],
  },
  genere_le: '2026-04-28T00:00:00.000Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plannings DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('createPlanning', () => {
    it('should return ok with parsed planning when DB insert succeeds', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: RAW_PLANNING_ROW, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createPlanning(PLANNING_INPUT);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.planning.id).toBe('planning-uuid');
        expect(result.planning.sejour_id).toBe('sejour-uuid');
        expect(result.planning.entries).toHaveLength(1);
        expect(result.planning.entries[0]?.recette_id).toBe('salade-tomate-basilic');
      }
    });

    it('should return query_failed when insert errors', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: null, error: { message: 'insert failed' } }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createPlanning(PLANNING_INPUT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('insert failed');
        }
      }
    });

    it('should return row_validation_failed when row shape is invalid (missing sejour_id)', async () => {
      const invalidRow: Record<string, unknown> = { ...RAW_PLANNING_ROW };
      delete invalidRow['sejour_id'];

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: invalidRow, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createPlanning(PLANNING_INPUT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });
  });
});
