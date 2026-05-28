/**
 * Tests d'intégration du module LLM — appellent l'API Anthropic réelle.
 *
 * COÛT : ~0.02 € par run (tests 1 et 3 font chacun 1 appel LLM).
 * EXCLUS de la CI par défaut — lancer manuellement avec :
 *   npm run test:integration
 *
 * Pré-requis : ANTHROPIC_API_KEY défini dans .env.local.
 * Si absent, tous les tests sont ignorés (vitest skip) avec un message explicite.
 */
import dotenv from 'dotenv';
import path from 'path';
// Chargement avant tout accès à process.env (les imports sont hoistés, ce code s'exécute après)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { beforeAll, describe, expect, it } from 'vitest';
import { createAnthropicClient } from './client';
import { generatePlanning } from './generate-planning';
import type { GeneratePlanningInput } from './types';
import type { FilterConstraints } from '../allergens/filter';
import { EU14_ALLERGENS } from '../../../data/seed-allergenes';
import { allRecettes, recettesMap } from '../../../tests/fixtures/recettes';
import {
  participantSansContrainte,
  participantVegetarien,
} from '../../../tests/fixtures/participants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hasApiKey = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

// ─── Fixtures partagées ───────────────────────────────────────────────────────

const SEJOUR_3_JOURS: GeneratePlanningInput['contexte'] = {
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 3, soirs: 3, brunchs: 0 },
  niveau_cuisine: 'facile',
  temps_disponible: 'standard',
};

const CONSTRAINTS_VEGETARIEN: FilterConstraints = {
  allergenes_groupe: [],
  regimes_groupe: ['vegetarien'],
  equipement_disponible: ['plaque', 'four'],
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('generatePlanning — intégration API Anthropic réelle', () => {
  beforeAll(() => {
    if (!hasApiKey()) {
      console.warn(
        '[integration] ANTHROPIC_API_KEY absent de .env.local — tous les tests sont ignorés.',
      );
    }
  });

  it.skipIf(!hasApiKey())(
    'happy path : 3 jours végétarien — 6 repas retournés, tous végétariens',
    async () => {
      console.log('[integration][test1] Démarrage happy path...');

      const client = createAnthropicClient(process.env.ANTHROPIC_API_KEY!);
      const catalogue = allRecettes();

      console.log(`[integration][test1] Catalogue : ${catalogue.length} recettes`);
      console.log('[integration][test1] Contraintes : végétarien, plaque+four, 3 jours');

      const result = await generatePlanning(
        client,
        catalogue,
        recettesMap,
        CONSTRAINTS_VEGETARIEN,
        [participantSansContrainte, participantVegetarien],
        SEJOUR_3_JOURS,
      );

      console.log('[integration][test1] Résultat :', JSON.stringify(result, null, 2));

      expect(result.ok, 'generatePlanning doit réussir').toBe(true);
      if (!result.ok) return;

      expect(result.entries).toHaveLength(6);

      for (const entry of result.entries) {
        const recette = recettesMap.get(entry.recette_id);
        expect(
          recette,
          `recette_id "${entry.recette_id}" absent du catalogue`,
        ).toBeDefined();
        if (recette === undefined) continue;

        expect(
          recette.est_vegetarien || recette.est_vegan,
          `Recette non-végétarienne dans le planning : ${recette.nom} (${recette.id})`,
        ).toBe(true);
      }

      console.log('[integration][test1] OK — 6 repas végétariens validés.');
    },
  );

  it.skipIf(!hasApiKey())(
    'pool vide : contraintes saturantes — pool_empty retourné sans appel LLM (coût : 0 €)',
    async () => {
      console.log('[integration][test2] Test pool vide — tous les EU14 + vegan + aucun équipement...');

      // Garantie de pool vide indépendante des fixtures :
      // toutes les recettes nécessitent plaque ou four ; avec equipement_disponible:[],
      // aucune ne passe le filtre, même en combinaison avec EU14+vegan.
      const constraints: FilterConstraints = {
        allergenes_groupe: [...EU14_ALLERGENS],
        regimes_groupe: ['vegan'],
        equipement_disponible: [],
      };

      // Vérifie que le chemin pool_empty n'atteint pas le LLM : ce client lève si appelé.
      const guardClient = {
        generate: async (): Promise<never> => {
          throw new Error('[test2] client.generate() appelé malgré un pool vide — bug dans generatePlanning');
        },
      };

      const result = await generatePlanning(
        guardClient,
        allRecettes(),
        recettesMap,
        constraints,
        [participantSansContrainte],
        SEJOUR_3_JOURS,
      );

      console.log('[integration][test2] Résultat :', JSON.stringify(result));

      expect(result.ok, 'generatePlanning doit échouer (pool vide)').toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe('pool_empty');

      console.log('[integration][test2] OK — pool_empty retourné, aucun appel LLM.');
    },
  );

  it.skipIf(!hasApiKey())(
    'mesure latence : appel complet happy path (informatif, sans assertion stricte)',
    async () => {
      console.log('[integration][test3] Démarrage mesure latence...');

      const client = createAnthropicClient(process.env.ANTHROPIC_API_KEY!);

      const start = performance.now();
      const result = await generatePlanning(
        client,
        allRecettes(),
        recettesMap,
        CONSTRAINTS_VEGETARIEN,
        [participantSansContrainte, participantVegetarien],
        SEJOUR_3_JOURS,
      );
      const latencyMs = Math.round(performance.now() - start);

      console.log(`[integration][test3] Latence : ${latencyMs} ms (cible <10 000 ms)`);
      console.log(`[integration][test3] Résultat ok : ${result.ok}`);

      // Aucune assertion bloquante sur la latence (variabilité réseau).
      // On vérifie seulement que l'appel a réussi.
      expect(result.ok, 'generatePlanning doit réussir pour mesurer la latence').toBe(true);

      console.log('[integration][test3] OK — latence mesurée.');
    },
  );
});
