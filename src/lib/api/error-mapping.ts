import type { DbError } from '@/lib/db/types';
import { jsonError } from './responses';

export function dbErrorToResponse(error: DbError): Response {
  switch (error.kind) {
    case 'not_found':
      return jsonError(404, 'not_found', `${error.entity} introuvable`);
    case 'connection_failed':
    case 'query_failed':
    case 'row_validation_failed':
      return jsonError(500, 'db_error', 'Erreur côté base de données');
    case 'constraint_violation':
      return jsonError(400, 'business_error', error.cause);
  }
}
