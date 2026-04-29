import { getSejourById } from '@/lib/db/sejours';
import { getPlanningBySejourId } from '@/lib/db/plannings';
import { getAllRecettesAsMap } from '@/lib/db/recettes';
import { getAllIngredientsAsMap } from '@/lib/db/ingredients';
import { buildShoppingList } from '@/lib/shopping/build-list';
import { jsonError, jsonSuccess } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';

export async function POST(
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

  const [planningResult, recettesResult, ingredientsResult] = await Promise.all([
    getPlanningBySejourId(id),
    getAllRecettesAsMap(),
    getAllIngredientsAsMap(),
  ]);

  if (!planningResult.ok) {
    if (planningResult.error.kind === 'not_found') {
      return jsonError(
        422,
        'business_error',
        'Aucun planning généré pour ce séjour. Générez un planning avant de calculer la liste de courses.',
      );
    }
    return dbErrorToResponse(planningResult.error);
  }

  if (!recettesResult.ok) return dbErrorToResponse(recettesResult.error);
  if (!ingredientsResult.ok) return dbErrorToResponse(ingredientsResult.error);

  const nbParticipants = sejourResult.sejour.participants.length;
  const result = buildShoppingList(
    planningResult.planning,
    recettesResult.recettes,
    ingredientsResult.ingredients,
    nbParticipants,
  );

  if (!result.ok) {
    if (result.error.kind === 'invalid_participants') {
      return jsonError(
        422,
        'business_error',
        'Le séjour doit contenir au moins un participant.',
      );
    }
    if (
      result.error.kind === 'recette_inconnue' ||
      result.error.kind === 'ingredient_inconnu'
    ) {
      return jsonError(
        500,
        'db_error',
        'Incohérence détectée entre le planning et le catalogue. Régénérez le planning.',
      );
    }
    return jsonError(500, 'db_error', 'Erreur inattendue');
  }

  return jsonSuccess(200, { items_par_categorie: result.items_par_categorie });
}
