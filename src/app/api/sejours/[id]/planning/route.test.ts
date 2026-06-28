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
}));
vi.mock('@/lib/llm/client', () => ({
  createAnthropicClient: vi.fn(),
}));
vi.mock('@/lib/llm/generate-planning', () => ({
  generatePlanning: vi.fn(),
}));

import { getSejourById } from '@/lib/db/sejours';
import { getAllRecettes, getAllRecettesAsMap } from '@/lib/db/recettes';
import { createPlanning } from '@/lib/db/plannings';
import { generatePlanning } from '@/lib/llm/generate-planning';
import { NextRequest } from 'next/server';
import { POST } from './route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'valid-token-abc';

const SEJOUR_FIXTURE = {
  id: 'sejour-uuid-123',
  token: VALID_TOKEN,
  nom: 'Séjour test',
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin' as const, midis: 2, soirs: 2, brunchs: 0 },
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
      error: { kind: 'validation_failed_after_retries', lastViolations: [] },
    });

    const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.kind).toBe('business_error');
  });

  it('llm_unavailable → 503 llm_unavailable', async () => {
    vi.mocked(generatePlanning).mockResolvedValue({
      ok: false,
      error: { kind: 'llm_unavailable', cause: 'timeout' },
    });

    const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.kind).toBe('llm_unavailable');
  });

  describe('dérivation des contraintes depuis les participants', () => {
    const STUB_ENTRIES = [
      { jour: 1, repas: 'midi' as const, recette_id: 'recette-test', portions: 2 },
    ];

    beforeEach(() => {
      vi.mocked(generatePlanning).mockResolvedValue({ ok: true, entries: STUB_ENTRIES });
    });

    it('union sur tous les participants — exclusion d\'un, allergène de l\'autre', async () => {
      vi.mocked(getSejourById).mockResolvedValue({
        ok: true,
        sejour: {
          ...SEJOUR_FIXTURE,
          participants: [
            { id: 'p1', nom: 'Alice', allergies: [], exclusions: ['vegetarien' as const], aime: [], n_aime_pas: [] },
            { id: 'p2', nom: 'Bob', allergies: ['arachides' as const], exclusions: [], aime: [], n_aime_pas: [] },
          ],
        },
      });

      await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      const constraints = vi.mocked(generatePlanning).mock.calls[0]![3];
      expect(constraints.exclusions_groupe).toContain('vegetarien');
      expect(constraints.allergenes_groupe).toContain('arachides');
    });

    it('déduplication — allergène partagé par deux participants apparaît une seule fois', async () => {
      vi.mocked(getSejourById).mockResolvedValue({
        ok: true,
        sejour: {
          ...SEJOUR_FIXTURE,
          participants: [
            { id: 'p1', nom: 'Alice', allergies: ['gluten' as const], exclusions: [], aime: [], n_aime_pas: [] },
            { id: 'p2', nom: 'Bob', allergies: ['gluten' as const], exclusions: [], aime: [], n_aime_pas: [] },
          ],
        },
      });

      await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      const constraints = vi.mocked(generatePlanning).mock.calls[0]![3];
      expect(constraints.allergenes_groupe.filter((a) => a === 'gluten')).toHaveLength(1);
    });

    it('équipement — constraints.equipement_disponible égal à sejour.parametres.equipement_disponible', async () => {
      await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      const constraints = vi.mocked(generatePlanning).mock.calls[0]![3];
      expect(constraints.equipement_disponible).toEqual(SEJOUR_FIXTURE.parametres.equipement_disponible);
    });

    it('persistance — createPlanning appelé avec les bonnes données, réponse 201', async () => {
      vi.mocked(getSejourById).mockResolvedValue({
        ok: true,
        sejour: {
          ...SEJOUR_FIXTURE,
          participants: [
            { id: 'p1', nom: 'Alice', allergies: ['arachides' as const], exclusions: ['vegetarien' as const], aime: [], n_aime_pas: [] },
          ],
        },
      });

      const response = await POST(makePostRequest(VALID_TOKEN), TEST_PARAMS);

      expect(response.status).toBe(201);
      expect(vi.mocked(createPlanning)).toHaveBeenCalledOnce();
      const persistCall = vi.mocked(createPlanning).mock.calls[0]![0];
      expect(persistCall.sejour_id).toBe(SEJOUR_FIXTURE.id);
      expect(persistCall.entries).toEqual(STUB_ENTRIES);
      expect(persistCall.contraintes_utilisees.allergenes).toContain('arachides');
      expect(persistCall.contraintes_utilisees.exclusions).toContain('vegetarien');
    });
  });
});
