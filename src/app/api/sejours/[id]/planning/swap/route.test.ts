import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/sejours', () => ({ getSejourById: vi.fn() }));
vi.mock('@/lib/db/recettes', () => ({
  getAllRecettes: vi.fn(),
  getAllRecettesAsMap: vi.fn(),
}));
vi.mock('@/lib/db/plannings', () => ({
  createPlanning: vi.fn(),
  getPlanningBySejourId: vi.fn(),
}));
vi.mock('@/lib/planning/build-constraints', () => ({
  buildPlanningConstraints: vi.fn(),
}));
vi.mock('@/lib/planning/swap-meal', () => ({
  getEligibleCandidates: vi.fn(),
  computeSwapResult: vi.fn(),
}));

import { getSejourById } from '@/lib/db/sejours';
import { getAllRecettes, getAllRecettesAsMap } from '@/lib/db/recettes';
import { createPlanning, getPlanningBySejourId } from '@/lib/db/plannings';
import { buildPlanningConstraints } from '@/lib/planning/build-constraints';
import { getEligibleCandidates, computeSwapResult } from '@/lib/planning/swap-meal';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'tok-abc';

const SEJOUR = {
  id: 'sejour-1',
  token: VALID_TOKEN,
  nom: 'Séjour test',
  nb_jours: 2,
  repartition_repas: { premier_repas: 'midi' as const, midis: 2, soirs: 2, brunchs: 0, slots_resto: [] },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile' as const,
    equipement_disponible: ['plaque' as const],
    temps_disponible: 'standard' as const,
  },
  cree_le: '2026-07-02T00:00:00Z',
};

const PLANNING = {
  id: 'plan-1',
  sejour_id: 'sejour-1',
  entries: [
    { kind: 'recette' as const, jour: 1, repas: 'midi' as const, recette_id: 'recette-a', portions: 4 },
    { kind: 'recette' as const, jour: 1, repas: 'soir' as const, recette_id: 'recette-b', portions: 4 },
    { kind: 'recette' as const, jour: 2, repas: 'midi' as const, recette_id: 'recette-c', portions: 4 },
    { kind: 'recette' as const, jour: 2, repas: 'soir' as const, recette_id: 'recette-d', portions: 4 },
  ],
  genere_le: '2026-07-02T00:00:00Z',
  contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque' as const] },
};

const CANDIDATE = { id: 'recette-e', nom: 'Recette E' };

const CONSTRAINTS = {
  allergenes_groupe: [],
  exclusions_groupe: [],
  equipement_disponible: ['plaque' as const],
};

const NEW_PLANNING = { ...PLANNING, id: 'plan-2' };

function makeGetRequest(sejourId: string, qs: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set('X-Sejour-Token', token);
  return new NextRequest(`http://localhost/api/sejours/${sejourId}/planning/swap?${qs}`, {
    method: 'GET',
    headers,
  });
}

function makePostRequest(sejourId: string, body: unknown, token?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== undefined) headers.set('X-Sejour-Token', token);
  return new NextRequest(`http://localhost/api/sejours/${sejourId}/planning/swap`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── Setup commun ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR });
  vi.mocked(getAllRecettes).mockResolvedValue({ ok: true, recettes: [] });
  vi.mocked(getAllRecettesAsMap).mockResolvedValue({ ok: true, recettes: new Map() });
  vi.mocked(getPlanningBySejourId).mockResolvedValue({ ok: true, planning: PLANNING });
  vi.mocked(buildPlanningConstraints).mockReturnValue(CONSTRAINTS);
  vi.mocked(getEligibleCandidates).mockReturnValue({ ok: true, candidates: [CANDIDATE as never] });
  vi.mocked(computeSwapResult).mockReturnValue({ ok: true, entries: PLANNING.entries });
  vi.mocked(createPlanning).mockResolvedValue({ ok: true, planning: NEW_PLANNING as never });
});

// ─── GET — Éligibles ──────────────────────────────────────────────────────────

describe('GET /planning/swap', () => {
  it('retourne 401 sans token', async () => {
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=soir'), params('sejour-1'));
    expect(res.status).toBe(401);
  });

  it('retourne 401 avec token invalide', async () => {
    vi.mocked(getSejourById).mockResolvedValueOnce({ ok: true, sejour: { ...SEJOUR, token: 'autre' } });
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=soir', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(401);
  });

  it('retourne 400 si paramètres manquants', async () => {
    const res = await GET(makeGetRequest('sejour-1', 'jour=1', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si repas invalide', async () => {
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=brunch', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(400);
  });

  it('retourne 200 avec candidates quand des éligibles existent', async () => {
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=soir', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(200);
    const body = await res.json() as { candidates: unknown[] };
    expect(body.candidates).toHaveLength(1);
    expect((body.candidates[0] as { id: string }).id).toBe('recette-e');
  });

  it('retourne 422 no_alternative_available quand getEligibleCandidates échoue', async () => {
    vi.mocked(getEligibleCandidates).mockReturnValueOnce({ ok: false, kind: 'no_alternative_available' });
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=soir', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { kind: string } };
    expect(body.error.kind).toBe('no_alternative_available');
  });

  it('retourne 404 si planning absent', async () => {
    vi.mocked(getPlanningBySejourId).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'not_found', entity: 'planning', id: 'sejour-1' },
    });
    const res = await GET(makeGetRequest('sejour-1', 'jour=1&repas=soir', VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(404);
  });
});

// ─── POST — Commit ─────────────────────────────────────────────────────────────

describe('POST /planning/swap', () => {
  it('retourne 401 sans token', async () => {
    const res = await POST(makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'r-e' }), params('sejour-1'));
    expect(res.status).toBe(401);
  });

  it('retourne 400 si corps JSON invalide', async () => {
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-Sejour-Token': VALID_TOKEN });
    const req = new NextRequest('http://localhost/api/sejours/sejour-1/planning/swap', {
      method: 'POST',
      headers,
      body: 'non-json',
    });
    const res = await POST(req, params('sejour-1'));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si corps manque des champs requis', async () => {
    const res = await POST(makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1 }, VALID_TOKEN), params('sejour-1'));
    expect(res.status).toBe(400);
  });

  it('retourne 201 et la nouvelle ligne planning en cas de succès', async () => {
    const res = await POST(
      makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-e' }, VALID_TOKEN),
      params('sejour-1'),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { planning: { id: string } };
    expect(body.planning.id).toBe('plan-2');
    expect(vi.mocked(createPlanning)).toHaveBeenCalledOnce();
  });

  it('retourne 422 invalid_candidate si computeSwapResult rejette le choix', async () => {
    vi.mocked(computeSwapResult).mockReturnValueOnce({
      ok: false,
      error: { kind: 'invalid_candidate', recette_id: 'recette-x' },
    });
    const res = await POST(
      makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-x' }, VALID_TOKEN),
      params('sejour-1'),
    );
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { kind: string } };
    expect(body.error.kind).toBe('invalid_candidate');
  });

  it('retourne 422 no_alternative_available si plus aucun éligible au moment du commit', async () => {
    vi.mocked(computeSwapResult).mockReturnValueOnce({
      ok: false,
      error: { kind: 'no_alternative_available' },
    });
    const res = await POST(
      makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-e' }, VALID_TOKEN),
      params('sejour-1'),
    );
    expect(res.status).toBe(422);
    const body = await res.json() as { error: { kind: string } };
    expect(body.error.kind).toBe('no_alternative_available');
  });

  it('appelle createPlanning exactement une fois et retourne 201 (snapshot immuable)', async () => {
    await POST(
      makePostRequest('sejour-1', { kind: 'recette' as const, jour: 1, repas: 'soir', recette_id: 'recette-e' }, VALID_TOKEN),
      params('sejour-1'),
    );
    expect(vi.mocked(createPlanning)).toHaveBeenCalledTimes(1);
  });
});
