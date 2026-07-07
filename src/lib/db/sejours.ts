import 'server-only';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from './supabase';
import { SejourSchema, CreateSejourBodySchema } from '../types/schemas';
import type { Sejour, Participant, DbError } from '../types/domain';

export const SejourDALInputSchema = CreateSejourBodySchema
  .omit({ participants: true })
  .extend({ nom: z.string() });

export type SejourDALInput = z.infer<typeof SejourDALInputSchema>;

export type ParticipantDALInput = Omit<Participant, 'id'>;

type SejourResult =
  | { ok: true; sejour: Sejour }
  | { ok: false; error: DbError };

// Convertit une ligne brute Supabase (séjour + participants imbriqués)
// en objet compatible avec SejourSchema.
// date_debut est nullable en DB mais optionnel (string | undefined) dans Zod :
// on omet la propriété si null.
function mapSejourRow(item: unknown): unknown {
  if (typeof item !== 'object' || item === null) return item;
  const row = item as Record<string, unknown>;

  return {
    id: row['id'],
    token: row['token'],
    nom: row['nom'],
    ...(row['date_debut'] !== null ? { date_debut: row['date_debut'] } : {}),
    nb_jours: row['nb_jours'],
    repartition_repas: row['repartition_repas'],
    participants: Array.isArray(row['participants']) ? row['participants'] : [],
    parametres: row['parametres'],
    cree_le: row['cree_le'],
  };
}

/**
 * Retourne un séjour avec ses participants à partir de son identifiant UUID.
 * Retourne une erreur not_found si le séjour n'existe pas.
 */
export async function getSejourById(id: string): Promise<SejourResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sejours')
    .select('*, participants(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null) {
    return { ok: false, error: { kind: 'not_found', entity: 'sejour', id } };
  }

  const mapped = mapSejourRow(data);
  const parsed = SejourSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, sejour: parsed.data };
}

/**
 * Retourne un séjour avec ses participants à partir de son token de partage.
 * Retourne une erreur not_found si aucun séjour ne correspond au token.
 */
export async function getSejourByToken(token: string): Promise<SejourResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sejours')
    .select('*, participants(*)')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null) {
    return { ok: false, error: { kind: 'not_found', entity: 'sejour', id: token } };
  }

  const mapped = mapSejourRow(data);
  const parsed = SejourSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, sejour: parsed.data };
}

export async function updateSejour(
  id: string,
  input: SejourDALInput,
  participants: ParticipantDALInput[],
): Promise<SejourResult> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc('update_sejour_with_participants', {
    p_id: id,
    p_nom: input.nom,
    p_date_debut: input.date_debut ?? null,
    p_nb_jours: input.nb_jours,
    p_repartition_repas: input.repartition_repas,
    p_parametres: input.parametres,
    p_participants: participants.map((p) => ({
      nom: p.nom,
      allergies: p.allergies,
      exclusions: p.exclusions,
      aime: p.aime,
      n_aime_pas: p.n_aime_pas,
    })),
  });

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  const mapped = mapSejourRow(data);
  const parsed = SejourSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, sejour: parsed.data };
}

/**
 * Supprime un séjour et ses données liées (participants, plannings, feedback)
 * via ON DELETE CASCADE. Retourne une erreur not_found si le séjour n'existe pas.
 */
export async function deleteSejour(id: string): Promise<{ ok: true } | { ok: false; error: DbError }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sejours')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  if (data === null || data.length === 0) {
    return { ok: false, error: { kind: 'not_found', entity: 'sejour', id } };
  }

  return { ok: true };
}

export async function createSejour(
  input: SejourDALInput,
  participants: ParticipantDALInput[],
): Promise<SejourResult> {
  const supabase = getSupabaseClient();
  const token = randomUUID();

  const { data, error } = await supabase.rpc('create_sejour_with_participants', {
    p_token: token,
    p_nom: input.nom,
    p_date_debut: input.date_debut ?? null,
    p_nb_jours: input.nb_jours,
    p_repartition_repas: input.repartition_repas,
    p_parametres: input.parametres,
    p_participants: participants.map((p) => ({
      nom: p.nom,
      allergies: p.allergies,
      exclusions: p.exclusions,
      aime: p.aime,
      n_aime_pas: p.n_aime_pas,
    })),
  });

  if (error) {
    return { ok: false, error: { kind: 'query_failed', cause: error.message } };
  }

  const mapped = mapSejourRow(data);
  const parsed = SejourSchema.safeParse(mapped);

  if (!parsed.success) {
    return {
      ok: false,
      error: { kind: 'row_validation_failed', cause: parsed.error.message },
    };
  }

  return { ok: true, sejour: parsed.data };
}
