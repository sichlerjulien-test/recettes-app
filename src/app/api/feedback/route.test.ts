import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/sejours', () => ({ getSejourById: vi.fn() }));
vi.mock('@/lib/db/plannings', () => ({ getPlanningBySejourId: vi.fn() }));
vi.mock('@/lib/db/feedback', () => ({ insertFeedback: vi.fn() }));

import { getSejourById } from '@/lib/db/sejours';
import { getPlanningBySejourId } from '@/lib/db/plannings';
import { insertFeedback } from '@/lib/db/feedback';
import { NextRequest } from 'next/server';
import { POST } from './route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'tok-abc';
// UUIDs RFC 4122 v4 valides (version=4, variant=8) — Zod uuid() rejette les autres
const SEJOUR_ID = '00000000-0000-4000-8000-000000000001';
const PLANNING_ID = 'plan-1';

const SEJOUR = {
  id: SEJOUR_ID,
  token: VALID_TOKEN,
  nom: 'Séjour test',
  nb_jours: 2,
  repartition_repas: { premier_repas: 'midi' as const, midis: 2, soirs: 2, brunchs: 0, slots_resto: [] },
  participants: [] as never[],
  parametres: {
    niveau_cuisine: 'facile' as const,
    equipement_disponible: ['plaque' as const],
    temps_disponible: 'standard' as const,
  },
  cree_le: '2026-07-02T00:00:00Z',
};

const PLANNING = {
  id: PLANNING_ID,
  sejour_id: SEJOUR_ID,
  entries: [
    { kind: 'recette' as const, jour: 1, repas: 'midi' as const, recette_id: 'recette-a', portions: 4 },
    { kind: 'recette' as const, jour: 1, repas: 'soir' as const, recette_id: 'recette-b', portions: 4 },
    { kind: 'resto' as const, jour: 2, repas: 'midi' as const },
  ],
  genere_le: '2026-07-02T00:00:00Z',
  contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque' as const] },
};

const VALID_BODY = {
  sejour_id: SEJOUR_ID,
  planning_id: PLANNING_ID,
  jour: 1,
  repas: 'midi',
  recette_id: 'recette-a',
};

function makeRequest(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token !== undefined) headers.set('X-Sejour-Token', token);
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSejourById).mockResolvedValue({ ok: true, sejour: SEJOUR });
    vi.mocked(getPlanningBySejourId).mockResolvedValue({ ok: true, planning: PLANNING });
    vi.mocked(insertFeedback).mockResolvedValue({ ok: true });
  });

  it('retourne 401 si token absent', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('retourne 401 si token invalide', async () => {
    const res = await POST(makeRequest(VALID_BODY, 'mauvais-token'));
    expect(res.status).toBe(401);
  });

  it('retourne 400 si body Zod invalide (sejour_id non-uuid), message générique, détail dans details', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, sejour_id: 'pas-un-uuid' }, VALID_TOKEN));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.message).toBe('Données invalides');
    expect(body.error.message).not.toContain('uuid');
    expect(body.error.details).toBeDefined();
  });

  it('retourne 400 si repas hors enum', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, repas: 'brunch' }, VALID_TOKEN));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si planning_id ne correspond pas au planning courant', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, planning_id: 'autre-plan' }, VALID_TOKEN));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si créneau inexistant dans le planning', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, jour: 99 }, VALID_TOKEN));
    expect(res.status).toBe(400);
  });

  it('retourne 400 si créneau est de kind resto (pas de pouce bas sur resto)', async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, jour: 2, repas: 'midi', recette_id: 'recette-x' }, VALID_TOKEN),
    );
    expect(res.status).toBe(400);
  });

  it('insère le feedback et retourne 201 pour payload valide', async () => {
    const res = await POST(makeRequest(VALID_BODY, VALID_TOKEN));
    expect(res.status).toBe(201);
    expect(insertFeedback).toHaveBeenCalledWith({
      sejour_id: SEJOUR_ID,
      planning_id: PLANNING_ID,
      jour: 1,
      repas: 'midi',
      recette_id: 'recette-a',
    });
  });

  it('insère le bon recette_id (snapshot : celui du body, pas celui du planning)', async () => {
    // recette_id intentionnellement différent de PLANNING.entries[0].recette_id ('recette-a')
    // pour vérifier que la route prend le recette_id du body, pas celui du planning.
    const bodyWithDifferentRecetteId = { ...VALID_BODY, recette_id: 'recette-snapshot-override' };
    const res = await POST(makeRequest(bodyWithDifferentRecetteId, VALID_TOKEN));
    expect(res.status).toBe(201);
    const call = vi.mocked(insertFeedback).mock.calls[0]?.[0];
    expect(call?.recette_id).toBe('recette-snapshot-override');
  });

  it('retourne 500 si insertFeedback échoue', async () => {
    vi.mocked(insertFeedback).mockResolvedValue({
      ok: false,
      error: { kind: 'query_failed', cause: 'DB error' },
    });
    const res = await POST(makeRequest(VALID_BODY, VALID_TOKEN));
    expect(res.status).toBe(500);
  });
});
