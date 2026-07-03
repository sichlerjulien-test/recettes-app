import type { MealType, Participant, PlanningEntry, Recette, ValidationViolation } from '../types/domain';
import { filterRecipes, type FilterConstraints } from '../allergens/filter';
import { filterByExclusions, type ExclusionConstraints } from '../dietary/filter';
import { validatePlanning } from '../allergens/validator';
import { validateExclusions } from '../dietary/validator';
import { validateCoherence, COHERENCE_SEVERITY } from '../coherence';
import type { CoherenceWarning } from '../coherence';
import { buildSequence } from '../planning/build-sequence';
import type { LLMClient } from './client';
import type { GeneratePlanningInput, LLMError } from './types';

// 3 tentatives totales (initial + 2 retries)
const MAX_ATTEMPTS = 3;

/**
 * Type combiné des contraintes de planification : allergènes + régimes + équipement.
 * Utilisé par generatePlanning et ses appelants (route, tests).
 */
export type PlanningConstraints = FilterConstraints & ExclusionConstraints;

/**
 * Orchestre la génération de planning : filtre → LLM → validation → retry.
 *
 * La fonction ne lance jamais d'exception : elle retourne toujours un résultat discriminé.
 * Le LLM ne reçoit jamais les allergies des participants (garantie architecturale ADR-001).
 *
 * Après réception de la sortie LLM, trois validateurs s'exécutent en séquence (ADR-009) :
 *   1. validatePlanning (sécurité : allergènes, recette_inconnue)
 *   2. validateDietary (régimes : vegan, végétarien)
 *   3. validateCoherence (cohérence : slots, doublons, ingredient_principal)
 * Le retry se déclenche sur violation sécurité OU violation cohérence 'bloquant'.
 * Les violations 'qualite' ne déclenchent pas de retry ; elles sont renvoyées comme warnings.
 *
 * @param client          - Client LLM injectable (Anthropic ou mock de test)
 * @param catalogue       - Catalogue complet des recettes
 * @param recettesMap     - Index recette_id → Recette pour la validation
 * @param constraints     - Contraintes extraites du groupe (allergènes, régimes, équipement)
 * @param participants    - Participants du séjour (pour la validation post-LLM)
 * @param sejourContexte  - Paramètres du séjour transmis au LLM
 * @param restoSlots      - Slots marqués « resto » dans le séjour (ADR-022) : injectés dans le planning post-LLM
 */
export async function generatePlanning(
  client: LLMClient,
  catalogue: Recette[],
  recettesMap: Map<string, Recette>,
  constraints: PlanningConstraints,
  participants: readonly Participant[],
  sejourContexte: GeneratePlanningInput['contexte'],
  restoSlots: readonly { jour: number; repas: MealType }[] = [],
): Promise<{ ok: true; entries: PlanningEntry[]; warnings?: CoherenceWarning[] } | { ok: false; error: LLMError }> {
  const allergenPool = filterRecipes(catalogue, constraints);
  if (allergenPool.length === 0) {
    return { ok: false, error: { kind: 'pool_empty', cause: 'allergen' } };
  }

  const pool = filterByExclusions(allergenPool, constraints);
  if (pool.length === 0) {
    return { ok: false, error: { kind: 'pool_empty', cause: 'exclusion' } };
  }

  // Tous les slots du séjour (resto + LLM) — expectedSlots pour validateCoherence (ADR-022)
  const allSlots = buildSequence(sejourContexte.repartition_repas);

  // Slots que le LLM doit couvrir (tous sauf les slots resto)
  const restoSet = new Set(restoSlots.map((s) => `${s.jour}:${s.repas}`));
  const llmSlots = allSlots.filter((s) => !restoSet.has(`${s.jour}:${s.repas}`));

  // Entrées resto à injecter après la génération LLM (ADR-022)
  const restoEntries: PlanningEntry[] = restoSlots.map((s) => ({
    kind: 'resto' as const,
    jour: s.jour,
    repas: s.repas,
  }));

  // Contexte transmis au LLM : slots explicites filtrés (hors resto) — uniquement si des slots resto sont présents
  const llmContexte: GeneratePlanningInput['contexte'] = restoSlots.length > 0
    ? { ...sejourContexte, slots_a_couvrir: llmSlots }
    : sejourContexte;

  const portions = Math.max(participants.length, 1);
  let lastSecurityViolations: ValidationViolation[] = [];
  let lastExclusionViolations: ValidationViolation[] = [];
  let lastCoherenceViolations: ValidationViolation[] = [];

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const output = await client.generate({ pool, contexte: llmContexte });

      const recetteEntries: PlanningEntry[] = output.entries.map((entry) => ({
        kind: 'recette' as const,
        ...entry,
        portions,
      }));
      const planningEntries: PlanningEntry[] = [...recetteEntries, ...restoEntries];

      const planningForValidation = {
        id: 'draft',
        sejour_id: 'draft',
        entries: planningEntries,
        genere_le: new Date().toISOString(),
        contraintes_utilisees: {
          allergenes: constraints.allergenes_groupe,
          exclusions: constraints.exclusions_groupe,
          equipement: constraints.equipement_disponible,
        },
      };

      const securityResult = validatePlanning(planningForValidation, recettesMap, participants);
      const dietaryViolations = validateExclusions(planningForValidation, recettesMap, participants);
      const coherenceViolations = validateCoherence(planningForValidation, recettesMap, allSlots);

      const bloquantCoherence = coherenceViolations.filter(
        (v) => COHERENCE_SEVERITY[v.kind] === 'bloquant',
      );
      const qualiteCoherence = coherenceViolations.filter(
        (v) => COHERENCE_SEVERITY[v.kind] === 'qualite',
      ) as CoherenceWarning[];

      if (securityResult.violations.length === 0 && dietaryViolations.length === 0 && bloquantCoherence.length === 0) {
        return {
          ok: true,
          entries: planningEntries,
          ...(qualiteCoherence.length > 0 ? { warnings: qualiteCoherence } : {}),
        };
      }

      lastSecurityViolations = securityResult.violations;
      lastExclusionViolations = dietaryViolations;
      lastCoherenceViolations = bloquantCoherence;
      // MVP : log via console.warn. Logger injectable à introduire au Sprint 1
      // si besoin d'audit structuré (cf. ADR-001 mention "audit").
      console.warn(
        `[generatePlanning] tentative ${attempt + 1}/${MAX_ATTEMPTS} — ${lastSecurityViolations.length} sécurité / ${lastExclusionViolations.length} exclusion / ${lastCoherenceViolations.length} cohérence`,
        { security: lastSecurityViolations, exclusion: lastExclusionViolations, coherence: lastCoherenceViolations },
      );
    }

    return {
      ok: false,
      error: {
        kind: 'validation_failed_after_retries',
        last_security_violations: lastSecurityViolations,
        last_exclusion_violations: lastExclusionViolations,
        last_coherence_violations: lastCoherenceViolations,
      },
    };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: 'llm_unavailable', cause } };
  }
}
