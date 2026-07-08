import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/sejours', () => ({
  getSejourById: vi.fn(),
}));
vi.mock('@/lib/db/recettes', () => ({
  getAllRecettes: vi.fn(),
  getAllRecettesAsMap: vi.fn(),
}));
vi.mock('@/lib/db/plannings', () => ({
  createPlanning: vi.fn(),
  getPlanningBySejourId: vi.fn(),
  countPlanningsBySejourId: vi.fn(),
}));
vi.mock('@/lib/llm/client', () => ({
  createAnthropicClient: vi.fn(),
}));
vi.mock('@/lib/llm/generate-planning', () => ({
  generatePlanning: vi.fn(),
}));
vi.mock('@/lib/planning/build-constraints', () => ({
  buildPlanningConstraints: vi.fn(),
}));

import { getSejourById } from '@/lib/db/sejours';
import { getAllRecettes, getAllRecettesAsMap } from '@/lib/db/recettes';
import { countPlanningsBySejourId, createPlanning } from '@/lib/db/plannings';
import { generatePlanning } from '@/lib/llm/generate-planning';
import { buildPlanningConstraints } from '@/lib/planning/build-constraints';
import { NextRequest } from 'next/server';
import { POST } from './route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-token-abc';

const SEJOUR_FIXTURE = {
  id: 'sejour-uuid-123',
  token: VALID_TOKEN,
  nom: 'Séjour test',
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin' as const, midis: 2, soirs: 2, brunchs: 0, slots_resto: [] },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile' as const,
    equipement_disponible: ['plaque' as const],
    temps_disponible: 'standard' as const,
  },
  cree_le: '2026-04-28T00:00:00.000Z',
};

function makePostRequest(token?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== undefined) {
    headers.set('X-Sejour-Token', token);
  }
  return new NextRequest('http://localhost/api/sejours/sejour-uuid-123/planning', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
}

const TEST_PARAMS = { params: Promise.resolve({ id: 'sejour-uuid-123' }) };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sejours/[id]/planning', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR_FIXTURE });
    vi.mocked(getAllRecettes).mockResolvedValue({ ok: true, recettes: [] });
    vi.mocked(getAllRecettesAsMap).mockResolvedValue({ ok: true, recettes: new Map() });
    vi.mocked(countPlanningsBySejourId).mockResolvedValue({ ok: true, count: 0 });
    vi.mocked(createPlanning).mockResolvedValue({
      ok: true,
      planning: {
        id: 'planning-1',
        sejour_id: 'sejour-uuid-123',
        entries: [],
        genere_le: '2026-06-28T00:00:00.000Z',
        contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque'] },
      },
    });
  });

  // Contrat verrouillé : pool_empty est un kind API distinct (pas business_error)
  // et porte details.cause — le client discrimine bannière/redirect et différencie
  // le message allergène/exclusion selon cette valeur.
  describe('pool_empty → 422', () => {
    it('cause allergen : status 422, kind pool_empty, details.cause allergen, message allergène', async () => {
      vi.mocked(generatePlanning).mockResolvedValue({
        ok: false,
        error: { kind: 'pool_empty', cause: 'allergen' },
      });

      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.kind).toBe('pool_empty');
      expect(body.error.details.cause).toBe('allergen');
      expect(body.error.message).toContain('allergi');
    });

    it('cause exclusion : status 422, kind pool_empty, details.cause exclusion, message exclusion', async () => {
      vi.mocked(generatePlanning).mockResolvedValue({
        ok: false,
        error: { kind: 'pool_empty', cause: 'exclusion' },
      });

      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.kind).toBe('pool_empty');
      expect(body.error.details.cause).toBe('exclusion');
      expect(body.error.message).toContain('exclusion');
    });
  });

  it('validation_failed_after_retries → 422 business_error', async () => {
    vi.mocked(generatePlanning).mockResolvedValue({
      ok: false,
      error: { kind: 'validation_failed_after_retries', last_security_violations: [], last_exclusion_violations: [], last_coherence_violations: [] },
    });

    const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.kind).toBe('business_error');
  });

  it('llm_unavailable → 503 llm_unavailable, message générique sans la cause interne, cause loggée', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generatePlanning).mockResolvedValue({
      ok: false,
      error: { kind: 'llm_unavailable', cause: 'Connection timeout' },
    });

    const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.kind).toBe('llm_unavailable');
    expect(body.error.message).not.toContain('timeout');
    expect(body.error.message).not.toContain('Connection');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('llm_unavailable'), 'Connection timeout');
    spy.mockRestore();
  });

  // TK-55 / ADR-023 : plafond de générations par séjour — protège la disponibilité.
  describe('plafond de générations (TK-55)', () => {
    it('au plafond (count >= GENERATION_CAP) : 429 generation_cap_reached, generatePlanning jamais appelé', async () => {
      vi.mocked(countPlanningsBySejourId).mockResolvedValue({ ok: true, count: 20 });

      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.kind).toBe('generation_cap_reached');
      expect(vi.mocked(generatePlanning)).not.toHaveBeenCalled();
    });

    it('sous le plafond : génération normale inchangée (non-régression)', async () => {
      vi.mocked(countPlanningsBySejourId).mockResolvedValue({ ok: true, count: 19 });
      vi.mocked(buildPlanningConstraints).mockReturnValue({
        allergenes_groupe: [],
        exclusions_groupe: [],
        equipement_disponible: [],
      });
      vi.mocked(generatePlanning).mockResolvedValue({ ok: true, entries: [] });

      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(201);
      expect(vi.mocked(generatePlanning)).toHaveBeenCalledOnce();
    });
  });

  describe('délégation des contraintes', () => {
    const STUB_ENTRIES = [
      { kind: 'recette' as const, jour: 1, repas: 'midi' as const, recette_id: 'recette-test', portions: 0 },
    ];
    const STUB_CONSTRAINTS = {
      allergenes_groupe: ['arachides' as const],
      exclusions_groupe: ['vegetarien' as const],
      equipement_disponible: ['plaque' as const],
    };

    beforeEach(() => {
      vi.mocked(buildPlanningConstraints).mockReturnValue(STUB_CONSTRAINTS);
      vi.mocked(generatePlanning).mockResolvedValue({ ok: true, entries: STUB_ENTRIES });
    });

    it('la route appelle buildPlanningConstraints avec le sejour et passe le résultat à generatePlanning', async () => {
      await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(vi.mocked(buildPlanningConstraints)).toHaveBeenCalledOnce();
      expect(vi.mocked(buildPlanningConstraints)).toHaveBeenCalledWith(SEJOUR_FIXTURE);
      const constraints = vi.mocked(generatePlanning).mock.calls[0]![3];
      expect(constraints).toBe(STUB_CONSTRAINTS);
    });

    it('persistance — createPlanning appelé avec les bonnes données, réponse 201', async () => {
      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(201);
      expect(vi.mocked(createPlanning)).toHaveBeenCalledOnce();
      const persistCall = vi.mocked(createPlanning).mock.calls[0]![0];
      expect(persistCall.sejour_id).toBe(SEJOUR_FIXTURE.id);
      expect(persistCall.entries).toEqual(STUB_ENTRIES);
      expect(persistCall.contraintes_utilisees.allergenes).toContain('arachides');
      expect(persistCall.contraintes_utilisees.exclusions).toContain('vegetarien');
    });

    it('cross-device : restoSlots lu depuis le séjour DB, transmis à generatePlanning sans param body', async () => {
      // Séjour en DB avec un slot resto ; le body POST ne contient aucun paramètre resto
      const restoSlot = { jour: 1, repas: 'midi' as const };
      vi.mocked(getSejourById).mockResolvedValueOnce({
        ok: true,
        sejour: {
          ...SEJOUR_FIXTURE,
          repartition_repas: { ...SEJOUR_FIXTURE.repartition_repas, slots_resto: [restoSlot] },
        },
      });

      await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      // 7ème argument (index 6) = restoSlots
      const call = vi.mocked(generatePlanning).mock.calls[0]!;
      expect(call[6]).toEqual([restoSlot]);
    });
  });
});
