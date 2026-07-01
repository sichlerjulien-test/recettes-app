import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  _resetSupabaseClientForTests: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { createSejour, getSejourById, getSejourByToken, updateSejour, SejourDALInputSchema } from './sejours';
import type { SejourDALInput, ParticipantDALInput } from './sejours';
import { CreateSejourBodySchema } from '../types/schemas';

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

function createMockSupabase(
  tableQueues: Record<string, MockResult[]>,
  rpcQueue: MockResult[] = [],
) {
  const rpcQueueCopy = [...rpcQueue];
  const rpcSpy = vi.fn((_name: string, _args?: unknown) =>
    Promise.resolve(rpcQueueCopy.shift() ?? { data: null, error: null }),
  );
  const fromSpy = vi.fn((table: string) => {
    const queue = tableQueues[table] ?? [];
    const next = queue.shift() ?? { data: null, error: null };
    return makeChain(Promise.resolve(next));
  });
  return {
    from: fromSpy,
    rpc: rpcSpy,
    _rpcSpy: rpcSpy,
    _fromSpy: fromSpy,
  };
}

// cast nécessaire : mock partiel inclut _rpcSpy/_fromSpy (spies de test) absents de l'interface Supabase
function asMockClient(
  m: ReturnType<typeof createMockSupabase>,
): ReturnType<typeof getSupabaseClient> {
  return m as unknown as ReturnType<typeof getSupabaseClient>;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SEJOUR_INPUT: SejourDALInput = {
  nom: 'Séjour test',
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 },
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['four'],
    temps_disponible: 'standard',
  },
};

const PARTICIPANT_INPUT: ParticipantDALInput = {
  nom: 'Alex',
  allergies: [],
  exclusions: [],
  aime: [],
  n_aime_pas: [],
};

const SEJOUR_DB_ROW = {
  id: 'sejour-uuid-123',
  token: '12345678-1234-4abc-8abc-123456789012',
  nom: 'Séjour test',
  date_debut: null,
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['four'],
    temps_disponible: 'standard',
  },
  cree_le: '2026-04-28T00:00:00.000Z',
};

const SEJOUR_DB_ROW_WITH_PARTICIPANT = {
  ...SEJOUR_DB_ROW,
  participants: [
    {
      id: 'participant-uuid-123',
      nom: 'Alex',
      allergies: [],
      exclusions: ['vegetarien'],
      aime: [],
      n_aime_pas: [],
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('sejours DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('createSejour', () => {
    it('rpc 1× → séjour mappé, aucun SELECT post-create', async () => {
      const mock = createMockSupabase({}, [{ data: SEJOUR_DB_ROW, error: null }]);
      vi.mocked(getSupabaseClient).mockReturnValue(asMockClient(mock));

      const result = await createSejour(SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.nom).toBe('Séjour test');
        expect(result.sejour.nb_jours).toBe(3);
      }
      expect(mock._rpcSpy).toHaveBeenCalledOnce();
      expect(mock._fromSpy).not.toHaveBeenCalled();
      expect(mock._rpcSpy).toHaveBeenCalledWith(
        'create_sejour_with_participants',
        expect.objectContaining({
          p_nom: SEJOUR_INPUT.nom,
          p_nb_jours: SEJOUR_INPUT.nb_jours,
          p_repartition_repas: SEJOUR_INPUT.repartition_repas,
          p_parametres: SEJOUR_INPUT.parametres,
        }),
      );
    });

    it('rpc error → ok:false query_failed (zéro orphelin — atomicité RPC)', async () => {
      const mock = createMockSupabase({}, [{ data: null, error: { message: 'DB connection failed' } }]);
      vi.mocked(getSupabaseClient).mockReturnValue(asMockClient(mock));

      const result = await createSejour(SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('DB connection failed');
        }
      }
    });

    it('génère un token UUID v4 non-vide passé à la RPC', async () => {
      let capturedToken: string | undefined;
      const mock = createMockSupabase({}, [{ data: SEJOUR_DB_ROW, error: null }]);
      vi.mocked(getSupabaseClient).mockReturnValue(asMockClient(mock));
      mock._rpcSpy.mockImplementation((_name: string, args: unknown) => {
        capturedToken = (args as Record<string, unknown>)['p_token'] as string;
        return Promise.resolve({ data: SEJOUR_DB_ROW, error: null });
      });

      await createSejour(SEJOUR_INPUT, []);

      const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(capturedToken).toBeTruthy();
      expect(capturedToken).toMatch(UUID_V4_REGEX);
    });
  });

  describe('getSejourById', () => {
    it('should return not_found when row is null', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        asMockClient(createMockSupabase({
          sejours: [{ data: null, error: null }],
        })),
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
        asMockClient(createMockSupabase({
          sejours: [{ data: null, error: { message: 'query error' } }],
        })),
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
        asMockClient(createMockSupabase({
          sejours: [{ data: invalidRow, error: null }],
        })),
      );

      const result = await getSejourById('sejour-uuid-123');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });

    it('lit participant.exclusions directement', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        asMockClient(createMockSupabase({
          sejours: [{ data: SEJOUR_DB_ROW_WITH_PARTICIPANT, error: null }],
        })),
      );

      const result = await getSejourById('sejour-uuid-123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.participants[0]?.exclusions).toEqual(['vegetarien']);
      }
    });
  });

  describe('getSejourByToken', () => {
    it('should return ok with sejour when token matches', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        asMockClient(createMockSupabase({
          sejours: [{ data: SEJOUR_DB_ROW, error: null }],
        })),
      );

      const result = await getSejourByToken('12345678-1234-4abc-8abc-123456789012');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.token).toBe('12345678-1234-4abc-8abc-123456789012');
        expect(result.sejour.nom).toBe('Séjour test');
      }
    });
  });

  describe('updateSejour', () => {
    it('rpc 1× → séjour mappé, aucun SELECT post-update', async () => {
      const mock = createMockSupabase({}, [{ data: SEJOUR_DB_ROW, error: null }]);
      vi.mocked(getSupabaseClient).mockReturnValue(asMockClient(mock));

      const result = await updateSejour('sejour-uuid-123', SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sejour.nom).toBe('Séjour test');
        expect(result.sejour.nb_jours).toBe(3);
      }
      expect(mock._rpcSpy).toHaveBeenCalledOnce();
      expect(mock._fromSpy).not.toHaveBeenCalled();
      expect(mock._rpcSpy).toHaveBeenCalledWith(
        'update_sejour_with_participants',
        expect.objectContaining({
          p_id: 'sejour-uuid-123',
          p_nom: SEJOUR_INPUT.nom,
          p_nb_jours: SEJOUR_INPUT.nb_jours,
          p_repartition_repas: SEJOUR_INPUT.repartition_repas,
          p_parametres: SEJOUR_INPUT.parametres,
        }),
      );
    });

    it('rpc error → ok:false query_failed — aucune mutation partielle assumée', async () => {
      const mock = createMockSupabase({}, [{ data: null, error: { message: 'RPC procedure failed' } }]);
      vi.mocked(getSupabaseClient).mockReturnValue(asMockClient(mock));

      const result = await updateSejour('sejour-uuid-123', SEJOUR_INPUT, [PARTICIPANT_INPUT]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('RPC procedure failed');
        }
      }
    });
  });

  describe('SejourDALInputSchema — dérivé ADR-002', () => {
    it('valide une entrée construite depuis CreateSejourBodySchema (champs partagés en sync)', () => {
      const body = CreateSejourBodySchema.parse({
        nom: 'Camp été',
        nb_jours: 3,
        repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 },
        parametres: { niveau_cuisine: 'facile', equipement_disponible: ['four'], temps_disponible: 'standard' },
        participants: [{ nom: 'Alice', allergies: [], exclusions: [], aime: [], n_aime_pas: [] }],
      });
      const { participants: _p, ...rest } = body;
      const dalResult = SejourDALInputSchema.safeParse({ ...rest, nom: body.nom ?? 'Séjour' });
      expect(dalResult.success).toBe(true);
    });

    it('rejette une entrée sans nom (nom requis dans SejourDALInputSchema, contrairement au body)', () => {
      const result = SejourDALInputSchema.safeParse({
        nb_jours: 3,
        repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 },
        parametres: { niveau_cuisine: 'facile', equipement_disponible: ['four'], temps_disponible: 'standard' },
      });
      expect(result.success).toBe(false);
    });
  });
});
