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
      return jsonError(503, 'row_validation_failed', `Validation de ligne échouée : ${error.cause}`);
    case 'schema_drift': {
      const cols = error.missing.map((m) => `${m.table}.${m.column}`).join(', ');
      return jsonError(503, 'schema_drift', `Dérive de schéma DB — colonnes manquantes : ${cols}`);
    }
    case 'constraint_violation':
      return jsonError(400, 'business_error', error.cause);
  }
}
