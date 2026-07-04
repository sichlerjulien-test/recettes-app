import 'server-only';
import { z } from 'zod';
import { getSupabaseClient } from './supabase';
import type { DbError } from '../types/domain';
import { FeedbackBodySchema } from '../types/schemas';

export type InsertFeedbackInput = z.infer<typeof FeedbackBodySchema>;

type InsertFeedbackResult =
  | { ok: true }
  | { ok: false; error: DbError };

export async function insertFeedback(input: InsertFeedbackInput): Promise<InsertFeedbackResult> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('feedback')
    .insert({
      sejour_id: input.sejour_id,
      planning_id: input.planning_id,
      jour: input.jour,
      repas: input.repas,
      recette_id: input.recette_id,
    });

  if (error) {
    if ((error as { code?: string }).code === '23503') {
      return { ok: false, error: { kind: 'constraint_violation', cause: 'Séjour introuvable' } };
    }
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  return { ok: true };
}
