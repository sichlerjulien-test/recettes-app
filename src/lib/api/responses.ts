import { z } from 'zod';

export const ApiErrorSchema = z.object({
  error: z.object({
    kind: z.string(),
    message: z.string(),
  }),
});

export type ApiErrorKind =
  | 'validation_failed'
  | 'unauthorized'
  | 'not_found'
  | 'business_error'
  | 'pool_empty'
  | 'db_error'
  | 'llm_unavailable'
  | 'schema_drift'
  | 'row_validation_failed';

export function jsonError(
  status: number,
  kind: ApiErrorKind,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: { kind, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

export function jsonSuccess<T>(status: number, data: T): Response {
  return Response.json(data, { status });
}
