import type { Participant, PlanningEntry, Recette, ValidationViolation } from '../types/domain';
import { filterRecipes, type FilterConstraints } from '../allergens/filter';
import { validatePlanning } from '../allergens/validator';
import { buildSequence } from '../planning/build-sequence';
import type { LLMClient } from './client';
import type { GeneratePlanningInput, LLMError } from './types';

// 3 tentatives totales (initial + 2 retries)
const MAX_ATTEMPTS = 3;

/**
 * Orchestre la génération de planning : filtre → LLM → validation → retry.
 *
 * La fonction ne lance jamais d'exception : elle retourne toujours un résultat discriminé.
 * Le LLM ne reçoit jamais les allergies des participants (garantie architecturale ADR-001).
 *
 * @param client          - Client LLM injectable (Anthropic ou mock de test)
 * @param catalogue       - Catalogue complet des recettes
 * @param recettesMap     - Index recette_id → Recette pour la validation
 * @param filterConstraints - Contraintes extraites du groupe (allergènes, régimes, équipement)
 * @param participants    - Participants du séjour (pour la validation post-LLM)
 * @param sejourContexte  - Paramètres du séjour transmis au LLM
 */
export async function generatePlanning(
  client: LLMClient,
  catalogue: Recette[],
  recettesMap: Map<string, Recette>,
  filterConstraints: FilterConstraints,
  participants: readonly Participant[],
  sejourContexte: GeneratePlanningInput['contexte'],
): Promise<{ ok: true; entries: PlanningEntry[] } | { ok: false; error: LLMError }> {
  const pool = filterRecipes(catalogue, filterConstraints);

  if (pool.length === 0) {
    return { ok: false, error: { kind: 'pool_empty' } };
  }

  const expectedSlots = buildSequence(sejourContexte.repartition_repas);
  const portions = Math.max(participants.length, 1);
  let lastViolations: ValidationViolation[] = [];

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const output = await client.generate({ pool, contexte: sejourContexte });

      const planningEntries: PlanningEntry[] = output.entries.map((entry) => ({
        ...entry,
        portions,
      }));

      const planningForValidation = {
        id: 'draft',
        sejour_id: 'draft',
        entries: planningEntries,
        genere_le: new Date().toISOString(),
        contraintes_utilisees: {
          allergenes: filterConstraints.allergenes_groupe,
          regimes: filterConstraints.regimes_groupe,
          equipement: filterConstraints.equipement_disponible,
        },
      };

      const result = validatePlanning(
        planningForValidation,
        recettesMap,
        participants,
        expectedSlots,
      );

      if (result.valid) {
        return { ok: true, entries: planningEntries };
      }

      lastViolations = result.violations;
      // MVP : log via console.warn. Logger injectable à introduire au Sprint 1
      // si besoin d'audit structuré (cf. ADR-001 mention "audit").
      console.warn(
        `[generatePlanning] tentative ${attempt + 1}/${MAX_ATTEMPTS} — ${result.violations.length} violation(s)`,
        result.violations,
      );
    }

    return {
      ok: false,
      error: { kind: 'validation_failed_after_retries', lastViolations },
    };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: 'llm_unavailable', cause } };
  }
}
