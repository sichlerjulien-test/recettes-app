/**
 * Test d'intégration TK-56a — prouve que la suppression d'un séjour purge
 * réellement ses données liées via ON DELETE CASCADE (participants, plannings,
 * feedback), plutôt que de le supposer depuis le schéma.
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
import { createSejour, deleteSejour } from './sejours';
import { createPlanning } from './plannings';
import { insertFeedback } from './feedback';
import { getSupabaseClient } from './supabase';

const hasSupabaseCreds = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const SEJOUR_INPUT = {
  nom: 'Séjour test cascade',
  nb_jours: 2,
  repartition_repas: { premier_repas: 'matin' as const, midis: 1, soirs: 1, brunchs: 0, slots_resto: [] },
  parametres: {
    niveau_cuisine: 'facile' as const,
    equipement_disponible: ['plaque' as const],
    temps_disponible: 'standard' as const,
  },
};

const PARTICIPANT_INPUT = [
  { nom: 'Alice', allergies: [], exclusions: [], aime: [], n_aime_pas: [] },
];

describe.skipIf(!hasSupabaseCreds())('deleteSejour — CASCADE réel (intégration)', () => {
  it('supprime le séjour et purge participants, plannings et feedback liés', async () => {
    const sejourResult = await createSejour(SEJOUR_INPUT, PARTICIPANT_INPUT);
    expect(sejourResult.ok).toBe(true);
    if (!sejourResult.ok) return;
    const sejourId = sejourResult.sejour.id;

    const planningResult = await createPlanning({
      sejour_id: sejourId,
      entries: [],
      contraintes_utilisees: { allergenes: [], exclusions: [], equipement: ['plaque'] },
    });
    expect(planningResult.ok).toBe(true);
    if (!planningResult.ok) return;

    const feedbackResult = await insertFeedback({
      sejour_id: sejourId,
      planning_id: planningResult.planning.id,
      jour: 1,
      repas: 'midi',
      recette_id: 'recette-test-cascade',
    });
    expect(feedbackResult.ok).toBe(true);

    const supabase = getSupabaseClient();

    const deleteResult = await deleteSejour(sejourId);
    expect(deleteResult.ok).toBe(true);

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

  it('retourne not_found quand le séjour n\'existe pas ou a déjà été supprimé', async () => {
    const result = await deleteSejour('00000000-0000-0000-0000-000000000000');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });
});
