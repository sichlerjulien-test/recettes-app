import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/sejours', () => ({
  getSejourById: vi.fn(),
  updateSejour: vi.fn(),
}));

import { getSejourById, updateSejour } from '@/lib/db/sejours';
import { PATCH } from './route';

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

const VALID_BODY = {
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 },
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['plaque'],
    temps_disponible: 'standard',
  },
  participants: [
    { nom: 'Alice', allergies: [], regimes: [], aime: [], n_aime_pas: [] },
  ],
};

function makePatchRequest(body: unknown, token?: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== undefined) {
    headers.set('X-Sejour-Token', token);
  }
  return new Request('http://localhost/api/sejours/sejour-uuid-123', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

const TEST_PARAMS = { params: Promise.resolve({ id: 'sejour-uuid-123' }) };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/sejours/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 unauthorized when X-Sejour-Token header is absent', async () => {
    const response = await PATCH(makePatchRequest(VALID_BODY), TEST_PARAMS);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.kind).toBe('unauthorized');
  });

  it('returns 401 unauthorized when token does not match sejour.token', async () => {
    vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR_FIXTURE });

    const response = await PATCH(makePatchRequest(VALID_BODY, 'wrong-token'), TEST_PARAMS);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.kind).toBe('unauthorized');
  });

  it('returns 200 with sejour when token is valid and update succeeds', async () => {
    vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR_FIXTURE });
    vi.mocked(updateSejour).mockResolvedValue({ ok: true, sejour: SEJOUR_FIXTURE });

    const response = await PATCH(makePatchRequest(VALID_BODY, VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nom).toBe('Séjour test');
    expect(body.nb_jours).toBe(3);
    // L'UI dérive l'action depuis le contexte métier : confirm si planning existant, generate sinon.
    // Les tests de determineRegenerationAction couvrent cette logique dans sejour-edit.test.ts.
  });

  it('returns db_error when updateSejour returns an error', async () => {
    vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR_FIXTURE });
    vi.mocked(updateSejour).mockResolvedValue({
      ok: false,
      error: { kind: 'query_failed', cause: 'DB write failed' },
    });

    const response = await PATCH(makePatchRequest(VALID_BODY, VALID_TOKEN), TEST_PARAMS);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.kind).toBe('db_error');
  });
});
