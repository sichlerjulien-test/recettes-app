import { createSejour, type SejourDALInput } from '@/lib/db/sejours';
import { CreateSejourBodySchema } from '@/lib/types/schemas';
import { jsonError, jsonSuccess } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'validation_failed', 'Corps de la requête JSON invalide');
  }

  const parsed = CreateSejourBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'validation_failed', 'Données invalides', parsed.error.flatten());
  }

  const { nom, date_debut, nb_jours, repartition_repas, parametres, participants } = parsed.data;

  const sejourInput: SejourDALInput = {
    nom: nom ?? 'Séjour',
    nb_jours,
    repartition_repas,
    parametres,
  };
  if (date_debut !== undefined) {
    sejourInput.date_debut = date_debut;
  }

  const result = await createSejour(sejourInput, participants);

  if (!result.ok) {
    if (result.error.kind === 'constraint_violation') {
      return jsonError(400, 'business_error', result.error.cause);
    }
    return dbErrorToResponse(result.error);
  }

  const { id, token } = result.sejour;

  return jsonSuccess(201, {
    id,
    token,
    url_share: `/sejour/${id}?t=${token}`,
  });
}
