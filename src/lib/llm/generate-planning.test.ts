import { describe, expect, it } from 'vitest';
import { filterRecipes } from '../allergens/filter';
import type { LLMClient } from './client';
import { generatePlanning, type PlanningConstraints } from './generate-planning';
import type { GeneratePlanningInput, GeneratePlanningOutput } from './types';
import { allRecettes, recettesMap } from '../../../tests/fixtures/recettes';
import {
  participantSansContrainte,
  participantCoeliaque,
  participantCoeliaqueVegan,
  participantVegan,
  participantAllergiesMultiples,
} from '../../../tests/fixtures/participants';
import { EU14_ALLERGENS } from '../../../data/seed-allergenes';

// ─── Constantes de test ───────────────────────────────────────────────────────

const ALL_EQUIPMENT: PlanningConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

const NO_CONSTRAINTS: PlanningConstraints = {
  allergenes_groupe: [],
  exclusions_groupe: [],
  equipement_disponible: ALL_EQUIPMENT,
};

const BASE_CONTEXTE: GeneratePlanningInput['contexte'] = {
  nb_jours: 1,
  repartition_repas: { premier_repas: 'matin', midis: 1, soirs: 1, brunchs: 0 },
  niveau_cuisine: 'facile',
  temps_disponible: 'standard',
};

/**
 * Deux recettes sans allergènes, ingredient_principal distincts → aucune violation consécutive.
 * salade-tomate-basilic: legumes (vegan)
 * omelette-legumes: oeufs (végétarien) — accepté car participantSansContrainte n'a aucun régime
 */
const VALID_OUTPUT: GeneratePlanningOutput = {
  entries: [
    { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
    { jour: 1, repas: 'soir', recette_id: 'omelette-legumes' },
  ],
};

/**
 * Le LLM retourne 2 entrées avec les bons slots mais des IDs inconnus.
 * Les deux IDs doivent être différents (sinon recette_dupliquee au lieu de recette_inconnue).
 */
const INVALID_OUTPUT_UNKNOWN_RECIPE: GeneratePlanningOutput = {
  entries: [
    { jour: 1, repas: 'midi', recette_id: 'recette-hallucination-xyz' },
    { jour: 1, repas: 'soir', recette_id: 'recette-hallucination-abc' },
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
    const constraints: PlanningConstraints = {
      ...NO_CONSTRAINTS,
      allergenes_groupe: ['gluten'],
    };
    const catalogue = allRecettes();
    const expectedPool = filterRecipes(catalogue, constraints);
    expect(expectedPool.length).toBeGreaterThan(0);
    const expectedIds = expectedPool.map((r) => r.id).sort();

    // VALID_OUTPUT (salade-tomate-basilic + omelette-legumes) est sans gluten → dans le pool filtré
    const mockClient = createMockClient({
      kind: 'success',
      output: VALID_OUTPUT,
    });

    await generatePlanning(mockClient, catalogue, recettesMap, constraints, [participantSansContrainte], BASE_CONTEXTE);

    expect(mockClient.calls).toHaveLength(1);
    expect(mockClient.calls[0]!.pool.map((r) => r.id).sort()).toEqual(expectedIds);
  });

  it('should NEVER pass allergens to the LLM when group has allergen constraints', async () => {
    const constraints: PlanningConstraints = {
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

  it('should make at most 3 total attempts when all fail', async () => {
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
        { jour: 1, repas: 'soir', recette_id: 'recette-hallucination-abc' },
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

  // Profils contraints de bout en bout (sécurité) ────────────────────────────────

  describe('profils contraints', () => {

    // Contraintes dérivées directement depuis le profil participant (même logique que la route)
    const COELIAQUE_CONSTRAINTS: PlanningConstraints = {
      allergenes_groupe: participantCoeliaque.allergies,
      exclusions_groupe: participantCoeliaque.exclusions,
      equipement_disponible: ALL_EQUIPMENT,
    };
    const VEGAN_CONSTRAINTS: PlanningConstraints = {
      allergenes_groupe: participantVegan.allergies,
      exclusions_groupe: participantVegan.exclusions,
      equipement_disponible: ALL_EQUIPMENT,
    };
    const ALLERGIES_MULTIPLES_CONSTRAINTS: PlanningConstraints = {
      allergenes_groupe: participantAllergiesMultiples.allergies,
      exclusions_groupe: participantAllergiesMultiples.exclusions,
      equipement_disponible: ALL_EQUIPMENT,
    };
    const COELIAQUE_VEGAN_CONSTRAINTS: PlanningConstraints = {
      allergenes_groupe: participantCoeliaqueVegan.allergies,
      exclusions_groupe: participantCoeliaqueVegan.exclusions,
      equipement_disponible: ALL_EQUIPMENT,
    };

    // Sorties LLM valides pour chaque profil.
    // Profil coeliaque : salade-tomate-basilic (pas de gluten) + tajine-agneau-soir (pas de gluten,
    //   ingredient_principal 'boeuf' ≠ 'legumes' → pas de violation consecutif)
    const VALID_COELIAQUE_OUTPUT: GeneratePlanningOutput = {
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
        { jour: 1, repas: 'soir', recette_id: 'tajine-agneau-soir' },
      ],
    };
    // Profil vegan : contexte 1 seul slot (midi) pour éviter ingredient_principal_consecutif
    // car toutes les recettes vegan du catalogue de fixture ont ingredient_principal 'legumes'.
    const SINGLE_MIDI_CONTEXTE: GeneratePlanningInput['contexte'] = {
      nb_jours: 1,
      repartition_repas: { premier_repas: 'midi', midis: 1, soirs: 0, brunchs: 0 },
      niveau_cuisine: 'facile',
      temps_disponible: 'standard',
    };
    const VALID_VEGAN_OUTPUT: GeneratePlanningOutput = {
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
      ],
    };
    // Profil allergies multiples : mêmes recettes sans allergène que coeliaque (salade-tomate-basilic
    // et tajine-agneau-soir n'ont ni gluten, ni lait, ni fruits-coque, ni arachides)
    const VALID_ALLERGIES_MULTIPLES_OUTPUT: GeneratePlanningOutput = {
      entries: [
        { jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' },
        { jour: 1, repas: 'soir', recette_id: 'tajine-agneau-soir' },
      ],
    };

    it('participantCoeliaque : ok:true avec planning sans gluten', async () => {
      const mockClient = createMockClient({ kind: 'success', output: VALID_COELIAQUE_OUTPUT });

      const result = await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        COELIAQUE_CONSTRAINTS,
        [participantCoeliaque],
        BASE_CONTEXTE,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const entry of result.entries) {
          const recette = recettesMap.get(entry.recette_id)!;
          expect(recette.allergenes_calcules).not.toContain('gluten');
        }
      }
    });

    it('participantVegan : ok:true avec planning 100 % vegan', async () => {
      const mockClient = createMockClient({ kind: 'success', output: VALID_VEGAN_OUTPUT });

      const result = await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        VEGAN_CONSTRAINTS,
        [participantVegan],
        SINGLE_MIDI_CONTEXTE,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const entry of result.entries) {
          const recette = recettesMap.get(entry.recette_id)!;
          expect(recette.exclusions_compatibles).toContain('vegan');
        }
      }
    });

    it('participantCoeliaqueVegan : ok:true avec planning vegan et sans gluten (allergen + dietary en séquence)', async () => {
      // salade-tomate-basilic : exclusions_compatibles inclut 'vegan', pas de gluten → passe les deux validateurs
      const mockClient = createMockClient({ kind: 'success', output: { entries: [{ jour: 1, repas: 'midi', recette_id: 'salade-tomate-basilic' }] } });

      const result = await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        COELIAQUE_VEGAN_CONSTRAINTS,
        [participantCoeliaqueVegan],
        { nb_jours: 1, repartition_repas: { premier_repas: 'midi', midis: 1, soirs: 0, brunchs: 0 }, niveau_cuisine: 'facile', temps_disponible: 'standard' },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const entry of result.entries) {
          const recette = recettesMap.get(entry.recette_id)!;
          expect(recette.exclusions_compatibles).toContain('vegan');
          expect(recette.allergenes_calcules).not.toContain('gluten');
        }
      }
    });

    it('participantAllergiesMultiples : ok:true avec planning sans aucun de ses allergènes', async () => {
      const mockClient = createMockClient({ kind: 'success', output: VALID_ALLERGIES_MULTIPLES_OUTPUT });

      const result = await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        ALLERGIES_MULTIPLES_CONSTRAINTS,
        [participantAllergiesMultiples],
        BASE_CONTEXTE,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const entry of result.entries) {
          const recette = recettesMap.get(entry.recette_id)!;
          for (const allergen of participantAllergiesMultiples.allergies) {
            expect(recette.allergenes_calcules).not.toContain(allergen);
          }
        }
      }
    });

    // Discriminant obligatoire : si validatePlanning() est retiré, ce test doit ÉCHOUER ───────────

    it('discriminant : ok:false quand le mock LLM retourne une recette contenant un allergène interdit', async () => {
      // pates-bolognaise contient 'gluten' dans allergenes_calcules et est dans recettesMap,
      // mais il aurait dû être filtré du pool. Le validateur post-LLM est le backstop.
      const violatingOutput: GeneratePlanningOutput = {
        entries: [
          { jour: 1, repas: 'midi', recette_id: 'pates-bolognaise' },
          { jour: 1, repas: 'soir', recette_id: 'tajine-agneau-soir' },
        ],
      };
      const mockClient = createMockClient({
        kind: 'success_after_failures',
        failuresBefore: [violatingOutput, violatingOutput, violatingOutput],
        finalSuccess: VALID_COELIAQUE_OUTPUT,
      });

      const result = await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        COELIAQUE_CONSTRAINTS,
        [participantCoeliaque],
        BASE_CONTEXTE,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('validation_failed_after_retries');
        if (result.error.kind === 'validation_failed_after_retries') {
          const allergenViolations = result.error.lastViolations.filter((v) => v.kind === 'allergen');
          expect(allergenViolations.length).toBeGreaterThan(0);
          // La violation porte bien sur 'gluten' pour participantCoeliaque
          const glutenViolations = allergenViolations.filter(
            (v) => v.kind === 'allergen' && v.allergene === 'gluten',
          );
          expect(glutenViolations.length).toBeGreaterThan(0);
        }
      }
      // 3 tentatives toutes échouées, le LLM a bien été appelé (≠ pool_empty)
      expect(mockClient.calls).toHaveLength(3);
    });

    // Le LLM ne reçoit ni allergènes ni participants pour les profils contraints ──────────────────

    it('participantCoeliaque : le LLM ne reçoit jamais les allergènes ni les participants', async () => {
      const mockClient = createMockClient({ kind: 'success', output: VALID_COELIAQUE_OUTPUT });

      await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        COELIAQUE_CONSTRAINTS,
        [participantCoeliaque],
        BASE_CONTEXTE,
      );

      expect(mockClient.calls).toHaveLength(1);
      const callInput = mockClient.calls[0]!;
      expect('allergenes' in callInput).toBe(false);
      expect('allergies' in callInput).toBe(false);
      expect('participants' in callInput).toBe(false);
      expect(Object.keys(callInput).sort()).toEqual(['contexte', 'pool']);
    });

    it('participantAllergiesMultiples : le LLM ne reçoit jamais les allergènes ni les participants', async () => {
      const mockClient = createMockClient({ kind: 'success', output: VALID_ALLERGIES_MULTIPLES_OUTPUT });

      await generatePlanning(
        mockClient,
        allRecettes(),
        recettesMap,
        ALLERGIES_MULTIPLES_CONSTRAINTS,
        [participantAllergiesMultiples],
        BASE_CONTEXTE,
      );

      expect(mockClient.calls).toHaveLength(1);
      const callInput = mockClient.calls[0]!;
      expect('allergenes' in callInput).toBe(false);
      expect('allergies' in callInput).toBe(false);
      expect('participants' in callInput).toBe(false);
      expect(Object.keys(callInput).sort()).toEqual(['contexte', 'pool']);
    });

  });

  // Pool saturé → erreur explicite, jamais planning vide (ADR-001) ──────────────

  it('should return pool_empty without calling LLM when constraints saturate the catalogue (ADR-001)', async () => {
    // EU14 + pas d'équipement : tous les allergènes connus excluent ~13 recettes sur 19 ;
    // les 6 recettes sans allergène restantes sont toutes exclues par equipement_disponible: []
    // car toutes requièrent au moins 'plaque' ou 'four'.
    const saturatingConstraints: PlanningConstraints = {
      allergenes_groupe: [...EU14_ALLERGENS],
      exclusions_groupe: [],
      equipement_disponible: [],
    };
    const mockClient = createMockClient({ kind: 'success', output: VALID_OUTPUT });

    const result = await generatePlanning(
      mockClient,
      allRecettes(),
      recettesMap,
      saturatingConstraints,
      [participantSansContrainte],
      BASE_CONTEXTE,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('pool_empty');
    }
    // Garantie ADR-001 : le LLM n'est JAMAIS appelé si le pool est vide
    expect(mockClient.calls).toHaveLength(0);
  });

});
