export type ApiErrorKind =
  | 'validation_failed'
  | 'unauthorized'
  | 'not_found'
  | 'business_error'
  | 'db_error'
  | 'llm_unavailable';

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
