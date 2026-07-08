import 'server-only';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { getSejourById } from '@/lib/db/sejours';
import { getAllRecettes, getAllRecettesAsMap } from '@/lib/db/recettes';
import { createPlanning, getPlanningBySejourId } from '@/lib/db/plannings';
import { buildPlanningConstraints } from '@/lib/planning/build-constraints';
import { buildSequence } from '@/lib/planning/build-sequence';
import { getEligibleCandidates, computeSwapResult } from '@/lib/planning/swap-meal';
import { jsonError, jsonSuccess, zodValidationResponse } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';
import { MealTypeSchema } from '@/lib/types/schemas';

const SwapSlotQuerySchema = z.object({
  jour: z.coerce.number().int().positive(),
  repas: MealTypeSchema,
});

const SwapCommitBodySchema = z.object({
  jour: z.number().int().positive(),
  repas: MealTypeSchema,
  recette_id: z.string().min(1),
});

async function loadContext(id: string, token: string | null) {
  if (!token) {
    return { ok: false as const, response: jsonError(401, 'unauthorized', 'Token de séjour requis') };
  }

  const sejourResult = await getSejourById(id);
  if (!sejourResult.ok) return { ok: false as const, response: dbErrorToResponse(sejourResult.error) };
  if (sejourResult.sejour.token !== token) {
    return { ok: false as const, response: jsonError(401, 'unauthorized', 'Token invalide') };
  }

  const [catalogueResult, recettesMapResult, planningResult] = await Promise.all([
    getAllRecettes(),
    getAllRecettesAsMap(),
    getPlanningBySejourId(id),
  ]);

  if (!catalogueResult.ok) return { ok: false as const, response: dbErrorToResponse(catalogueResult.error) };
  if (!recettesMapResult.ok) return { ok: false as const, response: dbErrorToResponse(recettesMapResult.error) };
  if (!planningResult.ok) return { ok: false as const, response: dbErrorToResponse(planningResult.error) };

  const sejour = sejourResult.sejour;
  const constraints = buildPlanningConstraints(sejour);
  const expectedSlots = buildSequence(sejour.repartition_repas);

  return {
    ok: true as const,
    sejour,
    constraints,
    expectedSlots,
    catalogue: catalogueResult.recettes,
    recettesMap: recettesMapResult.recettes,
    planning: planningResult.planning,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const token = request.headers.get('X-Sejour-Token');

  const ctx = await loadContext(id, token);
  if (!ctx.ok) return ctx.response;

  const { searchParams } = request.nextUrl;
  const parsed = SwapSlotQuerySchema.safeParse({
    jour: searchParams.get('jour'),
    repas: searchParams.get('repas'),
  });
  if (!parsed.success) {
    return zodValidationResponse(parsed.error);
  }

  const { jour, repas } = parsed.data;

  const result = getEligibleCandidates({
    planning: ctx.planning,
    targetSlot: { jour, repas },
    catalogue: ctx.catalogue,
    recettesMap: ctx.recettesMap,
    constraints: ctx.constraints,
    participants: ctx.sejour.participants,
    expectedSlots: ctx.expectedSlots,
  });

  if (!result.ok) {
    return jsonError(422, 'no_alternative_available', 'Aucune recette éligible pour ce créneau');
  }

  return jsonSuccess(200, { candidates: result.candidates });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const token = request.headers.get('X-Sejour-Token');

  const ctx = await loadContext(id, token);
  if (!ctx.ok) return ctx.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'validation_failed', 'Corps JSON invalide');
  }

  const parsed = SwapCommitBodySchema.safeParse(body);
  if (!parsed.success) {
    return zodValidationResponse(parsed.error);
  }

  const { jour, repas, recette_id } = parsed.data;

  const swapResult = computeSwapResult({
    planning: ctx.planning,
    targetSlot: { jour, repas },
    chosenRecetteId: recette_id,
    catalogue: ctx.catalogue,
    recettesMap: ctx.recettesMap,
    constraints: ctx.constraints,
    participants: ctx.sejour.participants,
    expectedSlots: ctx.expectedSlots,
  });

  if (!swapResult.ok) {
    switch (swapResult.error.kind) {
      case 'no_alternative_available':
        return jsonError(422, 'no_alternative_available', 'Aucune recette éligible pour ce créneau');
      case 'invalid_candidate':
        return jsonError(422, 'invalid_candidate', 'Recette non éligible pour ce créneau');
      case 'validation_failed':
        return jsonError(422, 'business_error', 'Le planning résultant ne passe pas la validation');
    }
  }

  const persistResult = await createPlanning({
    sejour_id: ctx.sejour.id,
    entries: swapResult.entries,
    contraintes_utilisees: {
      allergenes: ctx.constraints.allergenes_groupe,
      exclusions: ctx.constraints.exclusions_groupe,
      equipement: ctx.constraints.equipement_disponible,
    },
  });

  if (!persistResult.ok) {
    return dbErrorToResponse(persistResult.error);
  }

  return jsonSuccess(201, { planning: persistResult.planning });
}
