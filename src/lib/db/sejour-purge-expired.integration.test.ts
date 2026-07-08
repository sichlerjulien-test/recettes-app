/**
 * Test d'intégration TK-56c — prouve que purge_expired_sejours() (016) purge
 * réellement un séjour expiré (>60j) et ses tables filles, et épargne un
 * séjour encore dans la fenêtre de rétention (ADR-024).
 *
 * EXCLU de la CI par défaut — lancer manuellement avec :
 *   npm run test:integration
 *
 * Pré-requis : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY définis
 * dans .env.local (instance dev). Si absents, tous les tests sont ignorés.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { describe, it, expect } from 'vitest';
import { createSejour } from './sejours';
import { createPlanning } from './plannings';
import { insertFeedback } from './feedback';
import { getSupabaseClient } from './supabase';

const hasSupabaseCreds = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const SEJOUR_INPUT = {
  nom: 'Séjour test purge',
  nb_jours: 2,
  repartition_repas: { premier_repas: 'matin' as const, midis: 1, soirs: 1, brunchs: 0, slots_resto: [] },
  parametres: {
    niveau_cuisine: 'facile' as const,
    equipement_disponible: ['plaque' as const],
    temps_disponible: 'standard' as const,
  },
};

const PARTICIPANT_INPUT = [
  { nom: 'Bob', allergies: [], exclusions: [], aime: [], n_aime_pas: [] },
];

async function creerSejourAge(joursAge: number) {
  const sejourResult = await createSejour(SEJOUR_INPUT, PARTICIPANT_INPUT);
  expect(sejourResult.ok).toBe(true);
  if (!sejourResult.ok) throw new Error('setup: createSejour a échoué');
  const sejourId = sejourResult.sejour.id;

  const planningResult = await createPlanning({
    sejour_id: sejourId,
    entries: [],
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque'] },
  });
  expect(planningResult.ok).toBe(true);
  if (!planningResult.ok) throw new Error('setup: createPlanning a échoué');

  const feedbackResult = await insertFeedback({
    sejour_id: sejourId,
    planning_id: planningResult.planning.id,
    jour: 1,
    repas: 'midi',
    recette_id: 'recette-test-purge',
  });
  expect(feedbackResult.ok).toBe(true);

  const supabase = getSupabaseClient();
  const { error: updateError } = await supabase
    .from('sejours')
    .update({ cree_le: new Date(Date.now() - joursAge * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', sejourId);
  expect(updateError).toBeNull();

  return sejourId;
}

describe.skipIf(!hasSupabaseCreds())('purge_expired_sejours — rétention 60j (intégration)', () => {
  it('purge un séjour de 61 jours et ses tables filles', async () => {
    const sejourId = await creerSejourAge(61);
    const supabase = getSupabaseClient();

    const { error: purgeError } = await supabase.rpc('purge_expired_sejours');
    expect(purgeError).toBeNull();

    const { data: sejourRows } = await supabase.from('sejours').select('id').eq('id', sejourId);
    expect(sejourRows).toHaveLength(0);

    const { data: participantRows } = await supabase
      .from('participants')
      .select('id')
      .eq('sejour_id', sejourId);
    expect(participantRows).toHaveLength(0);

    const { data: planningRows } = await supabase
      .from('plannings')
      .select('id')
      .eq('sejour_id', sejourId);
    expect(planningRows).toHaveLength(0);

    const { data: feedbackRows } = await supabase
      .from('feedback')
      .select('id')
      .eq('sejour_id', sejourId);
    expect(feedbackRows).toHaveLength(0);
  });

  it('épargne un séjour de 59 jours', async () => {
    const sejourId = await creerSejourAge(59);
    const supabase = getSupabaseClient();

    const { error: purgeError } = await supabase.rpc('purge_expired_sejours');
    expect(purgeError).toBeNull();

    const { data: sejourRows } = await supabase.from('sejours').select('id').eq('id', sejourId);
    expect(sejourRows).toHaveLength(1);

    await supabase.from('sejours').delete().eq('id', sejourId);
  });
});
