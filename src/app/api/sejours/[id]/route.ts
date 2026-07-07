import { getSejourById, updateSejour, deleteSejour, type SejourDALInput } from '@/lib/db/sejours';
import { CreateSejourBodySchema } from '@/lib/types/schemas';
import { jsonError, jsonSuccess } from '@/lib/api/responses';
import { dbErrorToResponse } from '@/lib/api/error-mapping';

export async function PATCH(
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

  const result = await updateSejour(id, sejourInput, participants);

  if (!result.ok) {
    return dbErrorToResponse(result.error);
  }

  return jsonSuccess(200, result.sejour);
}

export async function DELETE(
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

  const result = await deleteSejour(id);
  if (!result.ok) {
    return dbErrorToResponse(result.error);
  }

  return new Response(null, { status: 204 });
}
