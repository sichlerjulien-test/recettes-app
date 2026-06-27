import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { assertSchema, _resetSchemaGuardForTests } from './schema-guard';

// ─── Mock Supabase chainable builder pour guard (limit requis) ──────────────

type MockResult = { data: unknown; error: unknown };

function makeGuardChain(result: MockResult) {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected as never),
    catch: (onRejected: unknown) =>
      Promise.resolve(result).catch(onRejected as never),
    finally: (onFinally: unknown) =>
      Promise.resolve(result).finally(onFinally as never),
  };
  chain['select'] = () => chain;
  chain['limit'] = () => chain;
  return chain;
}

function createGuardMockSupabase(
  tableResults: Record<string, MockResult>,
): ReturnType<typeof getSupabaseClient> {
  return {
    from: (table: string) => {
      const result = tableResults[table] ?? { data: null, error: null };
      return makeGuardChain(result);
    },
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('schema-guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _resetSchemaGuardForTests();
  });

  it('retourne ok:true quand toutes les tables sont conformes', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createGuardMockSupabase({
        recettes: { data: [], error: null },
        recette_ingredients: { data: [], error: null },
        plannings: { data: [], error: null },
        ingredients: { data: [], error: null },
      }),
    );

    const result = await assertSchema();

    expect(result.ok).toBe(true);
  });

  it('retourne schema_drift nommant la colonne sur erreur 42703', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createGuardMockSupabase({
        recettes: {
          data: null,
          error: { code: '42703', message: 'column "exclusions_compatibles" does not exist' },
        },
        recette_ingredients: { data: [], error: null },
        plannings: { data: [], error: null },
        ingredients: { data: [], error: null },
      }),
    );

    const result = await assertSchema();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('schema_drift');
      if (result.error.kind === 'schema_drift') {
        expect(result.error.missing).toHaveLength(1);
        expect(result.error.missing[0]).toEqual({
          table: 'recettes',
          column: 'exclusions_compatibles',
        });
      }
    }
  });

  it('collecte les dérives sur plusieurs tables', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createGuardMockSupabase({
        recettes: {
          data: null,
          error: { code: '42703', message: 'column "exclusions_compatibles" does not exist' },
        },
        recette_ingredients: { data: [], error: null },
        plannings: {
          data: null,
          error: { code: '42703', message: 'column "contraintes_utilisees" does not exist' },
        },
        ingredients: { data: [], error: null },
      }),
    );

    const result = await assertSchema();

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'schema_drift') {
      expect(result.error.missing).toHaveLength(2);
      expect(result.error.missing.map((m) => m.table)).toContain('recettes');
      expect(result.error.missing.map((m) => m.table)).toContain('plannings');
    }
  });

  it('ignore les erreurs non-42703 (autres codes postgres ne déclenchent pas schema_drift)', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createGuardMockSupabase({
        recettes: {
          data: null,
          error: { code: '42P01', message: 'relation "recettes" does not exist' },
        },
        recette_ingredients: { data: [], error: null },
        plannings: { data: [], error: null },
        ingredients: { data: [], error: null },
      }),
    );

    const result = await assertSchema();

    // 42P01 n'est pas un schema_drift de colonne — le guard ne le signale pas
    expect(result.ok).toBe(true);
  });

  it("mémoïse le promise : getSupabaseClient n'est appelé qu'une fois pour deux appels", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createGuardMockSupabase({
        recettes: { data: [], error: null },
        recette_ingredients: { data: [], error: null },
        plannings: { data: [], error: null },
        ingredients: { data: [], error: null },
      }),
    );

    await assertSchema();
    await assertSchema();

    expect(vi.mocked(getSupabaseClient)).toHaveBeenCalledTimes(1);
  });
});
