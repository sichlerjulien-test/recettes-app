import 'server-only';
import { getSupabaseClient } from './supabase';
import { PlanningSchema } from '../types/schemas';
import type { Planning, PlanningEntry } from '../types/domain';
import type { DbError } from '../types/domain';

export type CreatePlanningInput = {
  sejour_id: string;
  entries: PlanningEntry[];
  contraintes_utilisees: Planning['contraintes_utilisees'];
};

type PlanningResult =
  | { ok: true; planning: Planning }
  | { ok: false; error: DbError };

function mapPlanningRow(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  const row = item as Record<string, unknown>;
  return {
    id: row['id'],
    sejour_id: row['sejour_id'],
    entries: row['entries'],
    contraintes_utilisees: row['contraintes_utilisees'],
    genere_le: row['genere_le'],
  };
}

export type GetPlanningResult =
  | { ok: true; planning: Planning }
  | { ok: false; error: DbError };

/**
 * Récupère le dernier planning généré pour un séjour.
 * Retourne not_found si aucun planning n'existe pour ce séjour.
 */
export async function getPlanningBySejourId(sejourId: string): Promise<GetPlanningResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('plannings')
    .select('*')
    .eq('sejour_id', sejourId)
    .order('genere_le', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null) {
    return { ok: false, error: { kind: 'not_found', entity: 'planning', id: sejourId } };
  }

  const parsed = PlanningSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, planning: parsed.data };
}

export async function createPlanning(input: CreatePlanningInput): Promise<PlanningResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('plannings')
    .insert({
      sejour_id: input.sejour_id,
      entries: input.entries,
      contraintes_utilisees: input.contraintes_utilisees,
    })
    .select()
    .single();

  if (error || data === null) {
    return {
      ok: false,
      error: {
        kind: 'query_failed',
        cause: error?.message ?? "Échec de l'insertion du planning",
      },
    };
  }

  const mapped = mapPlanningRow(data);
  const parsed = PlanningSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, planning: parsed.data };
}
