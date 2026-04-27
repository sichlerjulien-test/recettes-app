import { describe, expect, it } from 'vitest';
import { filterRecipes, type FilterConstraints } from '../allergens/filter';
import type { LLMClient } from './client';
import { generatePlanning } from './generate-planning';
import type { GeneratePlanningInput, GeneratePlanningOutput } from './types';
import { allRecettes, recettesMap } from '../../../tests/fixtures/recettes';
import { participantSansContrainte } from '../../../tests/fixtures/participants';

// ─── Constantes de test ───────────────────────────────────────────────────────

const ALL_EQUIPMENT: FilterConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

const NO_CONSTRAINTS: FilterConstraints = {
  allergenes_groupe: [],
  regimes_groupe: [],
  equipement_disponible: ALL_EQUIPMENT,
};

const BASE_CONTEXTE: GeneratePlanningInput['contexte'] = {
  nb_jours: 1,
  repartition_repas: { midis: 1, soirs: 1, brunchs: 0 },
  niveau_cuisine: 'facile',
  temps_disponible: 'standard',
};

/** Deux recettes vegan sans allergènes — toujours présentes dans le pool NO_CONSTRAINTS. */
const VALID_OUTPUT: GeneratePlanningOutput = {
  entries: [
    { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
    { jour: 1, repas: 'soir', recette_id: 'riz-saute-legumes' },
  ],
};

/** Le LLM hallucine un ID qui n'existe ni dans recettesMap ni dans le pool. */
const INVALID_OUTPUT_UNKNOWN_RECIPE: GeneratePlanningOutput = {
  entries: [
    { jour: 1, repas: 'midi', recette_id: 'recette-hallucination-xyz' },
  ],
};

// ─── Mock client ──────────────────────────────────────────────────────────────

type MockBehavior =
  | { kind: 'success'; output: GeneratePlanningOutput }
  | {
      kind: 'success_after_failures';
      failuresBefore: GeneratePlanningOutput[];
      finalSuccess: GeneratePlanningOutput;
    }
  | { kind: 'throw'; error: Error };

function createMockClient(
  behavior: MockBehavior,
): LLMClient & { calls: GeneratePlanningInput[] } {
  const calls: GeneratePlanningInput[] = [];
  let callCount = 0;
  return {
    calls,
    async generate(input: GeneratePlanningInput): Promise<GeneratePlanningOutput> {
      calls.push(input);
      const index = callCount++;
      switch (behavior.kind) {
        case 'success':
          return behavior.output;
        case 'success_after_failures': {
          const failure = behavior.failuresBefore[index];
          if (failure !== undefined) return failure;
          return behavior.finalSuccess;
        }
        case 'throw':
          throw behavior.error;
      }
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePlanning', () => {

  // Cas nominal ────────────────────────────────────────────────────────────────

  it('should return ok with entries when pool is non-empty and LLM produces a valid planning', async () => {
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]?.recette_id).toBe('salade-tomate-basilic');
    }
  });

  it('should pass exactly the filtered pool to the LLM when constraints exclude some recipes', async () => {
    const constraints: FilterConstraints = {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten'],
    };
    const catalogue = allRecettes();
    const expectedPool = filterRecipes(catalogue, constraints);
    expect(expectedPool.length).toBeGreaterThan(0);
    const expectedIds = expectedPool.map((r) => r.id).sort();

    const safeId = expectedPool[0]!.id;
    const mockClient = createMockClient({
      kind: 'success',
      output: { entries: [{ jour: 1, repas: 'midi', recette_id: safeId }] },
    });

    await generatePlanning(mockClient, catalogue, recettesMap, constraints, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(1);
    expect(mockClient.calls[0]!.pool.map((r) => r.id).sort()).toEqual(expectedIds);
  });

  it('should NEVER pass allergens to the LLM when group has allergen constraints', async () => {
    const constraints: FilterConstraints = {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten', 'lait'],
    };
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    await generatePlanning(mockClient, allRecettes(), recettesMap, constraints, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(1);
    const callInput = mockClient.calls[0]!;
    const contexteKeys = Object.keys(callInput.contexte).sort();
    expect(contexteKeys).toEqual(
      ['nb_jours', 'niveau_cuisine', 'repartition_repas', 'temps_disponible'].sort(),
    );
    expect('allergenes' in callInput).toBe(false);
    expect('allergies' in callInput).toBe(false);
  });

  it('should NEVER pass participant names to the LLM when participants are present', async () => {
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(mockClient.calls).toHaveLength(1);
    const callInput = mockClient.calls[0]!;
    expect('participants' in callInput).toBe(false);
    expect(Object.keys(callInput).sort()).toEqual(['contexte', 'pool']);
  });

  // Cas pool vide ───────────────────────────────────────────────────────────────

  it('should return error pool_empty when filterRecipes returns []', async () => {
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    const result = await generatePlanning(
      mockClient,
      [],
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('pool_empty');
    }
  });

  it('should NOT call LLM when pool is empty', async () => {
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    await generatePlanning(mockClient, [], recettesMap, NO_CONSTRAINTS, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(0);
  });

  // Cas validation ──────────────────────────────────────────────────────────────

  it('should retry up to 3 times when validatePlanning detects violations', async () => {
    const mockClient = createMockClient({
      kind: 'success_after_failures',
      failuresBefore: [INVALID_OUTPUT_UNKNOWN_RECIPE, INVALID_OUTPUT_UNKNOWN_RECIPE, INVALID_OUTPUT_UNKNOWN_RECIPE],
      finalSuccess: VALID_OUTPUT,
    });

    await generatePlanning(mockClient, allRecettes(), recettesMap, NO_CONSTRAINTS, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(3);
  });

  it('should return error validation_failed_after_retries after 3 failed retries with lastViolations populated', async () => {
    const mockClient = createMockClient({
      kind: 'success_after_failures',
      failuresBefore: [INVALID_OUTPUT_UNKNOWN_RECIPE, INVALID_OUTPUT_UNKNOWN_RECIPE, INVALID_OUTPUT_UNKNOWN_RECIPE],
      finalSuccess: VALID_OUTPUT,
    });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation_failed_after_retries');
      if (result.error.kind === 'validation_failed_after_retries') {
        expect(result.error.lastViolations.length).toBeGreaterThan(0);
        expect(result.error.lastViolations[0]?.kind).toBe('recette_inconnue');
      }
    }
  });

  it('should succeed if validation passes on the 2nd retry', async () => {
    const mockClient = createMockClient({
      kind: 'success_after_failures',
      failuresBefore: [INVALID_OUTPUT_UNKNOWN_RECIPE],
      finalSuccess: VALID_OUTPUT,
    });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(true);
    expect(mockClient.calls).toHaveLength(2);
  });

  // Cas réseau / erreur LLM ─────────────────────────────────────────────────────

  it('should return error llm_unavailable when client.generate throws', async () => {
    const mockClient = createMockClient({
      kind: 'throw',
      error: new Error('Connection timeout'),
    });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('llm_unavailable');
      if (result.error.kind === 'llm_unavailable') {
        expect(result.error.cause).toContain('Connection timeout');
      }
    }
  });

  it('should NOT retry on llm_unavailable when client.generate throws', async () => {
    const mockClient = createMockClient({
      kind: 'throw',
      error: new Error('Network error'),
    });

    await generatePlanning(mockClient, allRecettes(), recettesMap, NO_CONSTRAINTS, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(1);
  });

  it('should stringify non-Error throws via String(error)', async () => {
    const mockClient: LLMClient = {
      async generate() {
        throw 'network failure as string'; // pas une instance d'Error
      },
    };

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('llm_unavailable');
    if (result.error.kind !== 'llm_unavailable') return;
    expect(result.error.cause).toBe('network failure as string');
  });

  // Cas régression sécurité ─────────────────────────────────────────────────────

  it('should return error if mock LLM returns a recipe_id NOT in the pool', async () => {
    const outOfPoolOutput: GeneratePlanningOutput = {
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'recette-hallucination-xyz' },
      ],
    };
    const mockClient = createMockClient({
      kind: 'success_after_failures',
      failuresBefore: [outOfPoolOutput, outOfPoolOutput, outOfPoolOutput],
      finalSuccess: VALID_OUTPUT,
    });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      NO_CONSTRAINTS,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation_failed_after_retries');
      if (result.error.kind === 'validation_failed_after_retries') {
        const unknownViolations = result.error.lastViolations.filter(
          (v) => v.kind === 'recette_inconnue',
        );
        expect(unknownViolations.length).toBeGreaterThan(0);
      }
    }
  });

});
