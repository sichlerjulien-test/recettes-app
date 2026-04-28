import { getAllIngredients } from '@/lib/db/ingredients';
import { jsonError, jsonSuccess } from '@/lib/api/responses';

export async function GET(): Promise<Response> {
  const result = await getAllIngredients();

  if (!result.ok) {
    return jsonError(503, 'db_error', 'Connexion Supabase indisponible');
  }

  return jsonSuccess(200, {
    status: 'ok',
    supabase: 'connected',
    ingredients_count: result.ingredients.length,
  });
}
