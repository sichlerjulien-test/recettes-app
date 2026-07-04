import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { insertFeedback } from './feedback';

type MockResult = { data: unknown; error: unknown };

function makeChain(result: Promise<MockResult>) {
  return {
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
    insert: (_rows: unknown) => makeChain(result),
  };
}

function createMockSupabase(result: MockResult): ReturnType<typeof getSupabaseClient> {
  return {
    from: (_table: string) => makeChain(Promise.resolve(result)),
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

const INPUT = {
  sejour_id: 'sejour-uuid',
  planning_id: 'planning-uuid',
  jour: 1,
  repas: 'midi' as const,
  recette_id: 'salade-tomate',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('insertFeedback', () => {
  it('retourne ok:true en cas de succès', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createMockSupabase({ data: null, error: null })
    );

    const result = await insertFeedback(INPUT);
    expect(result).toEqual({ ok: true });
  });

  it('retourne constraint_violation pour erreur FK 23503', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createMockSupabase({ data: null, error: { code: '23503', message: 'FK violation' } })
    );

    const result = await insertFeedback(INPUT);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'constraint_violation', cause: 'Séjour introuvable' },
    });
  });

  it('retourne query_failed pour erreur générique', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      createMockSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    );

    const result = await insertFeedback(INPUT);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'query_failed', cause: 'relation does not exist' },
    });
  });
});
