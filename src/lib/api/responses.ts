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
  | 'generation_cap_reached'
  | 'no_alternative_available'
  | 'invalid_candidate'
  | 'db_error'
  | 'llm_unavailable'
  | 'schema_drift'
  | 'row_validation_failed';

// Assertion de confiance, pas un assainisseur (ADR-025). Accepte n'importe
// quelle chaîne sans validation runtime : la garantie est que le gate CI
// (scripts/check-jsonerror-message.ts) force tout non-littéral en arg 3 de
// jsonError à passer par ce wrap explicite, greppable et revu.
declare const safeMessageBrand: unique symbol;
export type SafeMessage = string & { readonly [safeMessageBrand]: 'SafeMessage' };

export function businessMessage(s: string): SafeMessage {
  return s as SafeMessage;
}

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

export function zodValidationResponse(error: z.ZodError): Response {
  return jsonError(400, 'validation_failed', 'Données invalides', error.flatten());
}
