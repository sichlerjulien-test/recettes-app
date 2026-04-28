import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  _resetSupabaseClientForTests: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { createSejour, getSejourById, getSejourByToken } from './sejours';
import type { SejourDALInput, ParticipantDALInput } from './sejours';

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

const SEJOUR_INPUT: SejourDALInput = {
  nom: 'Séjour test',
  nb_jours: 3,
  repartition_repas: { midis: 2, soirs: 2, brunchs: 0 },
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['four'],
    temps_disponible: 'standard',
  },
};

const PARTICIPANT_INPUT: ParticipantDALInput = {
  nom: 'Alex',
  allergies: [],
  regimes: [],
  aime: [],
  n_aime_pas: [],
};

const SEJOUR_DB_ROW = {
  id: 'sejour-uuid-123',
  token: '12345678-1234-4abc-8abc-123456789012',
  nom: 'Séjour test',
  date_debut: null,
  nb_jours: 3,
  repartition_repas: { midis: 2, soirs: 2, brunchs: 0 },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['four'],
    temps_disponible: 'standard',
  },
  cree_le: '2026-04-28T00:00:00.000Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sejours DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('createSejour', () => {
    it('should return ok with sejour when DB inserts succeed', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [
            { data: { id: 'sejour-uuid-123' }, error: null },
            { data: SEJOUR_DB_ROW, error: null },
          ],
          participants: [{ data: null, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createSejour(SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.nom).toBe('Séjour test');
        expect(result.sejour.nb_jours).toBe(3);
      }
    });

    it('should return query_failed when sejour insert errors', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: null, error: { message: 'DB connection failed' } }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createSejour(SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('DB connection failed');
        }
      }
    });

    it('should return query_failed when participants insert errors (sejour persisted — known transactional risk)', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: { id: 'sejour-uuid-123' }, error: null }],
          participants: [{ data: null, error: { message: 'Participants insert failed' } }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createSejour(SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('Participants insert failed');
        }
      }
    });

    it('should generate a UUID token via crypto.randomUUID (token non-empty and matches UUID v4 pattern)', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [
            { data: { id: 'sejour-uuid-123' }, error: null },
            { data: SEJOUR_DB_ROW, error: null },
          ],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await createSejour(SEJOUR_INPUT, []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(result.sejour.token).toBeTruthy();
        expect(result.sejour.token).toMatch(UUID_V4_REGEX);
      }
    });
  });

  describe('getSejourById', () => {
    it('should return not_found when row is null', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: null, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await getSejourById('unknown-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('not_found');
        if (result.error.kind === 'not_found') {
          expect(result.error.entity).toBe('sejour');
          expect(result.error.id).toBe('unknown-id');
        }
      }
    });

    it('should return query_failed when DB errors', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: null, error: { message: 'query error' } }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await getSejourById('some-id');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
      }
    });

    it('should return row_validation_failed when row shape is invalid (missing nb_jours)', async () => {
      const invalidRow: Record<string, unknown> = { ...SEJOUR_DB_ROW };
      delete invalidRow['nb_jours'];

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: invalidRow, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await getSejourById('sejour-uuid-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });
  });

  describe('getSejourByToken', () => {
    it('should return ok with sejour when token matches', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          sejours: [{ data: SEJOUR_DB_ROW, error: null }],
        }) as unknown as ReturnType<typeof getSupabaseClient>,
      );

      const result = await getSejourByToken('12345678-1234-4abc-8abc-123456789012');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.token).toBe('12345678-1234-4abc-8abc-123456789012');
        expect(result.sejour.nom).toBe('Séjour test');
      }
    });
  });
});
