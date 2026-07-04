import 'server-only';
import type { NextRequest } from 'next/server';
import { getSejourById } from '@/lib/db/sejours';
import { getPlanningBySejourId } from '@/lib/db/plannings';
import { insertFeedback } from '@/lib/db/feedback';
import { FeedbackBodySchema } from '@/lib/types/schemas';
import { jsonError, jsonSuccess } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';

export async function POST(request: NextRequest): Promise<Response> {
  const token = request.headers.get('X-Sejour-Token');
  if (!token) {
    return jsonError(401, 'unauthorized', 'Token de séjour requis');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'validation_failed', 'Corps JSON invalide');
  }

  const parsed = FeedbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_failed', `Corps invalide : ${parsed.error.message}`);
  }

  const { sejour_id, planning_id, jour, repas, recette_id } = parsed.data;

  const sejourResult = await getSejourById(sejour_id);
  if (!sejourResult.ok) return dbErrorToResponse(sejourResult.error);
  if (sejourResult.sejour.token !== token) {
    return jsonError(401, 'unauthorized', 'Token invalide');
  }

  const planningResult = await getPlanningBySejourId(sejour_id);
  if (!planningResult.ok) return dbErrorToResponse(planningResult.error);
  if (planningResult.planning.id !== planning_id) {
    return jsonError(400, 'validation_failed', 'planning_id ne correspond pas au planning courant du séjour');
  }

  const planningEntries = planningResult.planning.entries;
  const entryExists = planningEntries.some(
    (e) => e.jour === jour && e.repas === repas && e.kind !== 'resto',
  );
  if (!entryExists) {
    return jsonError(400, 'validation_failed', 'Créneau introuvable dans le planning');
  }

  const insertResult = await insertFeedback({ sejour_id, planning_id, jour, repas, recette_id });
  if (!insertResult.ok) return dbErrorToResponse(insertResult.error);

  return jsonSuccess(201, {});
}
