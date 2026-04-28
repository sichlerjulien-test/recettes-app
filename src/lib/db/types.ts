import { z } from 'zod';

export const DbErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('connection_failed'), cause: z.string() }),
  z.object({ kind: z.literal('query_failed'), cause: z.string() }),
  z.object({ kind: z.literal('row_validation_failed'), cause: z.string() }),
  z.object({ kind: z.literal('not_found'), entity: z.string(), id: z.string() }),
  z.object({ kind: z.literal('constraint_violation'), cause: z.string() }),
]);

export type DbError = z.infer<typeof DbErrorSchema>;
