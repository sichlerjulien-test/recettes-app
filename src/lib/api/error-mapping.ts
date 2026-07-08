import type { DbError } from '@/lib/types/domain';
import { jsonError } from './responses';

export function dbErrorToResponse(error: DbError): Response {
  switch (error.kind) {
    case 'not_found':
      return jsonError(404, 'not_found', `${error.entity} introuvable`);
    case 'connection_failed':
    case 'query_failed':
      return jsonError(500, 'db_error', 'Erreur côté base de données');
    case 'row_validation_failed':
      console.error('[dbErrorToResponse] row_validation_failed:', error.cause);
      return jsonError(503, 'row_validation_failed', 'Erreur de validation des données côté serveur');
    case 'schema_drift': {
      console.error('[dbErrorToResponse] schema_drift — colonnes manquantes :', error.missing);
      return jsonError(503, 'schema_drift', 'Service temporairement indisponible');
    }
    case 'constraint_violation':
      // .cause ici = message métier auteur-contrôlé, jamais une chaîne brute.
      return jsonError(400, 'business_error', error.cause);
  }
}
