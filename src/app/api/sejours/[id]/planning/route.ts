import type { NextRequest } from 'next/server';
import { getSejourById } from '@/lib/db/sejours';
import { getAllRecettes, getAllRecettesAsMap } from '@/lib/db/recettes';
import { countPlanningsBySejourId, createPlanning, getPlanningBySejourId } from '@/lib/db/plannings';
import { createAnthropicClient } from '@/lib/llm/client';
import { generatePlanning } from '@/lib/llm/generate-planning';
import { buildPlanningConstraints } from '@/lib/planning/build-constraints';
import { businessMessage, jsonError, jsonSuccess } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';

// Plafond de générations par séjour (TK-55, ADR-023) — protège la disponibilité,
// pas le portefeuille (le budget cap console Anthropic joue ce rôle).
const GENERATION_CAP = 20;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const token = request.headers.get('X-Sejour-Token');
  if (!token) {
    return jsonError(401, 'unauthorized', 'Token de séjour requis');
  }

  const sejourResult = await getSejourById(id);
  if (!sejourResult.ok) {
    return dbErrorToResponse(sejourResult.error);
  }
  if (sejourResult.sejour.token !== token) {
    return jsonError(401, 'unauthorized', 'Token invalide');
  }

  const planningResult = await getPlanningBySejourId(id);
  if (!planningResult.ok) {
    return dbErrorToResponse(planningResult.error);
  }

  return jsonSuccess(200, { planning: planningResult.planning });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const token = request.headers.get('X-Sejour-Token');
  if (!token) {
    return jsonError(401, 'unauthorized', 'Token de séjour requis');
  }

  const sejourResult = await getSejourById(id);
  if (!sejourResult.ok) {
    return dbErrorToResponse(sejourResult.error);
  }

  const sejour = sejourResult.sejour;

  if (sejour.token !== token) {
    return jsonError(401, 'unauthorized', 'Token invalide');
  }

  const [catalogueResult, recettesMapResult] = await Promise.all([
    getAllRecettes(),
    getAllRecettesAsMap(),
  ]);

  if (!catalogueResult.ok) return dbErrorToResponse(catalogueResult.error);
  if (!recettesMapResult.ok) return dbErrorToResponse(recettesMapResult.error);

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return jsonError(503, 'llm_unavailable', 'Configuration LLM manquante');
  }

  const countResult = await countPlanningsBySejourId(id);
  if (!countResult.ok) {
    return dbErrorToResponse(countResult.error);
  }
  if (countResult.count >= GENERATION_CAP) {
    return jsonError(
      429,
      'generation_cap_reached',
      'Nombre maximal de générations atteint pour ce séjour',
    );
  }

  const constraints = buildPlanningConstraints(sejour);

  const contexte = {
    nb_jours: sejour.nb_jours,
    repartition_repas: sejour.repartition_repas,
    niveau_cuisine: sejour.parametres.niveau_cuisine,
    temps_disponible: sejour.parametres.temps_disponible,
  };

  const restoSlots = sejour.repartition_repas.slots_resto;

  const client = createAnthropicClient(apiKey);

  const planningResult = await generatePlanning(
    client,
    catalogueResult.recettes,
    recettesMapResult.recettes,
    constraints,
    sejour.participants,
    contexte,
    restoSlots,
  );

  if (!planningResult.ok) {
    switch (planningResult.error.kind) {
      case 'pool_empty': {
        const { cause } = planningResult.error;
        const message = cause === 'allergen'
          ? 'Aucune recette ne correspond aux allergies déclarées. Vérifiez les allergies des participants.'
          : 'Aucune recette ne correspond à ces exclusions alimentaires. Essayez d\'en retirer une.';
        return jsonError(422, 'pool_empty', businessMessage(message), { cause });
      }
      case 'validation_failed_after_retries':
        return jsonError(
          422,
          'business_error',
          'Impossible de composer un planning conforme après plusieurs tentatives',
        );
      case 'llm_unavailable':
        console.error('[POST /planning] llm_unavailable:', planningResult.error.cause);
        return jsonError(503, 'llm_unavailable', 'Service de génération temporairement indisponible');
    }
  }

  const persistResult = await createPlanning({
    sejour_id: sejour.id,
    entries: planningResult.entries,
    contraintes_utilisees: {
      allergenes: constraints.allergenes_groupe,
      exclusions: constraints.exclusions_groupe,
      equipement: constraints.equipement_disponible,
    },
  });

  if (!persistResult.ok) {
    return dbErrorToResponse(persistResult.error);
  }

  return jsonSuccess(201, { planning: persistResult.planning });
}
