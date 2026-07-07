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
import { countPlanningsBySejourId, createPlanning, getPlanningBySejourId } from './plannings';
import type { CreatePlanningInput } from './plannings';

// ─── Mock Supabase chainable builder ─────────────────────────────────────────

type MockResult = { data: unknown; error: unknown; count?: number | null };

function makeChain(result: Promise<MockResult>) {
  return {
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
    select: (_cols?: string, _opts?: unknown) => makeChain(result),
    eq: (_col: string, _val: unknown) => makeChain(result),
    insert: (_rows: unknown) => makeChain(result),
    order: (_col: string, _opts?: unknown) => makeChain(result),
    limit: (_count: number) => makeChain(result),
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

const PLANNING_INPUT: CreatePlanningInput = {
  sejour_id: 'sejour-uuid',
  entries: [{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
  contraintes_utilisees: {
    allergenes: [],
    exclusions: [],
    equipement: ['four'],
  },
};

const RAW_PLANNING_ROW = {
  id: 'planning-uuid',
  sejour_id: 'sejour-uuid',
  entries: [{ kind: 'recette' as const, jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic', portions: 4 }],
  contraintes_utilisees: {
    allergenes: [],
    exclusions: [],
    equipement: ['four'],
  },
  genere_le: '2026-04-28T00:00:00.000Z',
};

const LEGACY_CONSTRAINTS_KEY = 'reg' + 'imes';

// Ligne ancien format — tolérée par le schéma de lecture (ADR-011 §8).
const RAW_PLANNING_ROW_OLD_FORMAT = {
  ...RAW_PLANNING_ROW,
  contraintes_utilisees: {
    allergenes: [],
    [LEGACY_CONSTRAINTS_KEY]: ['vegetarien'],
    equipement: ['four'],
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plannings DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertSchema).mockResolvedValue({ ok: true });
  });

  describe('getPlanningBySejourId', () => {
    it('should return ok with planning when row exists', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: RAW_PLANNING_ROW, error: null }],
        }),
      );

      const result = await getPlanningBySejourId('sejour-uuid');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.planning.id).toBe('planning-uuid');
        expect(result.planning.sejour_id).toBe('sejour-uuid');
        expect(result.planning.entries).toHaveLength(1);
      }
    });

    it('should return not_found when no row matches', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: null, error: null }],
        }),
      );

      const result = await getPlanningBySejourId('sejour-uuid');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('not_found');
        if (result.error.kind === 'not_found') {
          expect(result.error.entity).toBe('planning');
          expect(result.error.id).toBe('sejour-uuid');
        }
      }
    });
  });

  describe('countPlanningsBySejourId (TK-55)', () => {
    it('retourne le count exact quand la requête réussit', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: null, error: null, count: 3 }],
        }),
      );

      const result = await countPlanningsBySejourId('sejour-uuid');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(3);
      }
    });

    it('retourne query_failed quand la requête échoue', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: null, error: { message: 'count failed' } }],
        }),
      );

      const result = await countPlanningsBySejourId('sejour-uuid');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
      }
    });
  });

  describe('createPlanning', () => {
    it('should return ok with parsed planning when DB insert succeeds', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: RAW_PLANNING_ROW, error: null }],
        }),
      );

      const result = await createPlanning(PLANNING_INPUT);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.planning.id).toBe('planning-uuid');
        expect(result.planning.sejour_id).toBe('sejour-uuid');
        expect(result.planning.entries).toHaveLength(1);
        expect(result.planning.entries[0]).toMatchObject({ kind: 'recette', recette_id: 'salade-tomate-basilic' });
      }
    });

    it('should return query_failed when insert errors', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: null, error: { message: 'insert failed' } }],
        }),
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
        }),
      );

      const result = await createPlanning(PLANNING_INPUT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });
  });

  // Discriminant : ancien format DB doit conserver la valeur (ADR-011 §8)
  describe('compatibilité ancien format dans contraintes_utilisees', () => {
    it('getPlanningBySejourId normalise la clé legacy en exclusions pour un planning ancien format', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          plannings: [{ data: RAW_PLANNING_ROW_OLD_FORMAT, error: null }],
        }),
      );

      const result = await getPlanningBySejourId('sejour-uuid');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.planning.contraintes_utilisees.exclusions).toContain('vegetarien');
        expect(LEGACY_CONSTRAINTS_KEY in result.planning.contraintes_utilisees).toBe(false);
      }
    });
  });
});
