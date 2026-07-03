import { describe, expect, it } from 'vitest';
import type { PlanningConstraints } from '@/lib/llm/generate-planning';
import type { AllergenViolation, Participant, Planning } from '@/lib/types/domain';
import { EU14_ALLERGENS } from '../../../data/seed-allergenes';
import { filterRecipes } from '@/lib/allergens/filter';
import { filterByExclusions } from '@/lib/dietary/filter';
import { validatePlanning } from '@/lib/allergens/validator';
import { validateExclusions } from '@/lib/dietary/validator';
import {
  participantAllergiesMultiples,
  participantCoeliaque,
  participantCoeliaqueVegan,
  participantHauteCardinalite,
  participantLaitOeufs,
  participantSansContrainte,
  participantVegan,
  participantVegetarienAllergique,
  participantVegetarienLait,
} from '../../fixtures/participants';
import { allRecettes, recettesMap } from '../../fixtures/recettes';

// Mulberry32 seeded PRNG — deterministic, reproducible across runs
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_EQUIPMENT: PlanningConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

function buildPlanning(recetteIds: string[]): Planning {
  return {
    id: 'planning-intensif',
    sejour_id: 'sejour-intensif',
    entries: recetteIds.map((recette_id, i) => ({
      kind: 'recette' as const,
      jour: Math.floor(i / 2) + 1,
      repas: i % 2 === 0 ? ('midi' as const) : ('soir' as const),
      recette_id,
      portions: 6,
    })),
    genere_le: '2026-04-21T00:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
  };
}

function pickUniqueN<T>(arr: T[], n: number, rng: () => number): T[] {
  const available = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n && available.length > 0; i++) {
    const idx = Math.floor(rng() * available.length);
    result.push(available.splice(idx, 1)[0]!);
  }
  return result;
}

function runProfile(
  label: string,
  participants: Participant[],
  constraints: PlanningConstraints,
  seed: number,
  iterations: number,
): void {
  const rng = mulberry32(seed);
  const catalogue = allRecettes();
  const allergenSet = new Set(constraints.allergenes_groupe);

  // C. Assertion discriminante : vérifier qu'au moins une recette du catalogue
  //    contient un allergène déclaré, puis qu'elle est absente du pool filtré.
  //    Sans cette vérification, un test avec aucune recette contaminée passerait
  //    même avec le filtre allergènes désactivé — test invalide par construction.
  if (allergenSet.size > 0) {
    const contaminatedIds = catalogue
      .filter((r) => r.allergenes_calcules.some((a) => allergenSet.has(a)))
      .map((r) => r.id);

    expect(
      contaminatedIds.length,
      `Profil ${label}: aucune recette du catalogue ne porte les allergènes [${[...allergenSet]}] — test trivial, non discriminant`,
    ).toBeGreaterThan(0);

    const filteredOnce = filterByExclusions(filterRecipes(catalogue, constraints), constraints);
    for (const id of contaminatedIds) {
      expect(
        filteredOnce.some((r) => r.id === id),
        `[${label}] Recette contaminée "${id}" toujours présente dans le pool filtré — filtre inopérant`,
      ).toBe(false);
    }
  }

  let skippedIterations = 0;

  for (let i = 0; i < iterations; i++) {
    const filtered = filterByExclusions(filterRecipes(catalogue, constraints), constraints);
    if (filtered.length === 0) {
      skippedIterations++;
      continue;
    }

    const nb = Math.min(Math.floor(rng() * 5) + 1, filtered.length);
    const selected = pickUniqueN(filtered, nb, rng).map((r) => r.id);

    const planning = buildPlanning(selected);
    const allergenResult = validatePlanning(planning, recettesMap, participants);
    const dietaryViolations = validateExclusions(planning, recettesMap, participants);

    // Ce test vérifie uniquement la sécurité allergènes/régimes après filtrage.
    // Les violations structurelles (slots_mismatch, ingredient_consecutif) ne sont
    // pas pertinentes pour des plannings aléatoires construits hors buildSequence.
    const safetyViolations = [
      ...allergenResult.violations.filter((v) => v.kind === 'allergen'),
      ...dietaryViolations,
    ];
    if (safetyViolations.length > 0) {
      throw new Error(
        `[${label}] Iteration ${i + 1}: Planning invalide après filtrage.\n` +
        `Recettes sélectionnées : ${selected.join(', ')}\n` +
        `Violations : ${JSON.stringify(safetyViolations, null, 2)}`,
      );
    }
  }

  expect(
    skippedIterations,
    `Profil ${label}: pool filtré vide dans ${skippedIterations}/${iterations} itérations — contraintes trop restrictives ou catalogue insuffisant`,
  ).toBeLessThan(iterations);
}

describe('allergen-safety (1100 iterations)', () => {

  // ─── Profils de base (inchangés) ─────────────────────────────────────────────

  it('profil coeliaque: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'coeliaque',
      [participantCoeliaque],
      { allergenes_groupe: ['gluten'], exclusions_groupe: [], equipement_disponible: ALL_EQUIPMENT },
      0x1A2B3C4D,
      100,
    );
  });

  it('profil vegan: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'vegan',
      [participantVegan],
      { allergenes_groupe: [], exclusions_groupe: ['vegan'], equipement_disponible: ALL_EQUIPMENT },
      0x2B3C4D5E,
      100,
    );
  });

  it('profil coeliaque+vegan: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'coeliaque+vegan',
      [participantCoeliaqueVegan],
      { allergenes_groupe: ['gluten'], exclusions_groupe: ['vegan'], equipement_disponible: ALL_EQUIPMENT },
      0x3C4D5E6F,
      100,
    );
  });

  it('profil allergies multiples (gluten, lait, fruits-coque, arachides): 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'allergies-multiples',
      [participantAllergiesMultiples],
      {
        allergenes_groupe: participantAllergiesMultiples.allergies,
        exclusions_groupe: participantAllergiesMultiples.exclusions,
        equipement_disponible: ALL_EQUIPMENT,
      },
      0x4D5E6F70,
      100,
    );
  });

  it('groupe mixte (5 profils, contraintes union): 100 plannings filtrés sont tous valides', () => {
    const participants: Participant[] = [
      participantSansContrainte,
      participantCoeliaque,
      participantVegan,
      participantCoeliaqueVegan,
      participantAllergiesMultiples,
    ];
    const allergenes = [
      ...new Set(participants.flatMap((p) => p.allergies)),
    ] as PlanningConstraints['allergenes_groupe'];
    const exclusions = [
      ...new Set(participants.flatMap((p) => p.exclusions)),
    ] as PlanningConstraints['exclusions_groupe'];

    runProfile(
      'groupe-mixte',
      participants,
      { allergenes_groupe: allergenes, exclusions_groupe: exclusions, equipement_disponible: ALL_EQUIPMENT },
      0x5E6F7081,
      100,
    );
  });

  it('profil vegetarien allergique (fruits-coque, sesame): 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'vegetarien-allergique',
      [participantVegetarienAllergique],
      {
        allergenes_groupe: participantVegetarienAllergique.allergies,
        exclusions_groupe: participantVegetarienAllergique.exclusions,
        equipement_disponible: ALL_EQUIPMENT,
      },
      0x6F708192,
      100,
    );
  });

  // ─── Profils TK-11 : combinaisons manquantes ──────────────────────────────────

  it('profil lait+oeufs: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'lait+oeufs',
      [participantLaitOeufs],
      {
        allergenes_groupe: ['lait', 'oeufs'],
        exclusions_groupe: [],
        equipement_disponible: ALL_EQUIPMENT,
      },
      0x7F809192,
      100,
    );
  });

  it('profil haute-cardinalite (gluten+lait+oeufs+arachides+crustaces): 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'haute-cardinalite',
      [participantHauteCardinalite],
      {
        allergenes_groupe: ['gluten', 'lait', 'oeufs', 'arachides', 'crustaces'],
        exclusions_groupe: [],
        equipement_disponible: ALL_EQUIPMENT,
      },
      0x8091A2B3,
      100,
    );
  });

  it('profil gluten+arachides: 100 plannings filtrés sont tous valides', () => {
    const participant: Participant = {
      id: 'p-gluten-arachides', nom: 'Test',
      allergies: ['gluten', 'arachides'], exclusions: [], aime: [], n_aime_pas: [],
    };
    runProfile(
      'gluten+arachides',
      [participant],
      {
        allergenes_groupe: ['gluten', 'arachides'],
        exclusions_groupe: [],
        equipement_disponible: ALL_EQUIPMENT,
      },
      0x91A2B3C4,
      100,
    );
  });

  it('profil poissons+crustaces: 100 plannings filtrés sont tous valides', () => {
    const participant: Participant = {
      id: 'p-poissons-crustaces', nom: 'Test',
      allergies: ['poissons', 'crustaces'], exclusions: [], aime: [], n_aime_pas: [],
    };
    runProfile(
      'poissons+crustaces',
      [participant],
      {
        allergenes_groupe: ['poissons', 'crustaces'],
        exclusions_groupe: [],
        equipement_disponible: ALL_EQUIPMENT,
      },
      0xA2B3C4D5,
      100,
    );
  });

  // ─── Profils transverses régime × allergène ────────────────────────────────────

  it('profil vegetarien+lait: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'vegetarien+lait',
      [participantVegetarienLait],
      {
        allergenes_groupe: ['lait'],
        exclusions_groupe: ['vegetarien'],
        equipement_disponible: ALL_EQUIPMENT,
      },
      0xB3C4D5E6,
      100,
    );
  });

  // ─── Test discriminant vegan+cœliaque ─────────────────────────────────────────
  // Un planning qui viole l'une OU l'autre contrainte doit échouer indépendamment.

  it('test discriminant coeliaque+vegan : violation gluten OU non-vegan déclenche chacune un échec', () => {
    // Cas 1 : recette non-vegan (oeufs) → violation exclusion 'vegan' (validateExclusions)
    const planningNonVegan = buildPlanning(['omelette-legumes']);
    const dietaryViolationsNonVegan = validateExclusions(planningNonVegan, recettesMap, [participantCoeliaqueVegan]);
    expect(dietaryViolationsNonVegan.some((v) => v.kind === 'exclusion')).toBe(true);

    // Cas 2 : recette avec gluten → violation allergène 'gluten' (validatePlanning)
    const planningGluten = buildPlanning(['pates-bolognaise']);
    const resultGluten = validatePlanning(planningGluten, recettesMap, [participantCoeliaqueVegan]);
    expect(resultGluten.valid).toBe(false);
    expect(resultGluten.violations.some((v) => v.kind === 'allergen')).toBe(true);
  });

  // ─── Fallback LLM injecté ────────────────────────────────────────────────────
  // Simule une réponse LLM contenant une recette contaminée malgré le profil
  // allergique. Le validateur post-LLM doit la détecter et la rejeter (ce qui
  // déclencherait un retry dans le pipeline de génération, ADR-001 Étage 3).
  // Table de cas distincts : 4 recettes portant chacune lait via un ingrédient différent.

  const RECETTES_CONTAMINEES_LAIT = [
    { recette_id: 'carbonara-classique', ingredient: 'parmesan'    },
    { recette_id: 'gratin-dauphinois',   ingredient: 'lait-entier' },
    { recette_id: 'quiche-lorraine',     ingredient: 'lait-entier' },
    { recette_id: 'souffle-fromage',     ingredient: 'parmesan'    },
  ] as const;

  it.each(RECETTES_CONTAMINEES_LAIT)(
    'fallback LLM : $recette_id (lait via $ingredient) rejeté par le validateur post-LLM',
    ({ recette_id }) => {
      const planningContamine = buildPlanning([recette_id]);
      const result = validatePlanning(planningContamine, recettesMap, [participantLaitOeufs]);

      expect(result.valid).toBe(false);

      const allergenViolations = result.violations.filter(
        (v): v is AllergenViolation => v.kind === 'allergen',
      );
      expect(allergenViolations.length).toBeGreaterThan(0);

      const laitViolation = allergenViolations.find(
        (v) => v.recette_id === recette_id && v.allergene === 'lait',
      );
      expect(
        laitViolation,
        `Le validateur doit détecter lait dans ${recette_id} pour un profil lait+oeufs`,
      ).toBeDefined();
    },
  );

  // ─── Pool vide ────────────────────────────────────────────────────────────────

  it('doit signaler explicitement un pool filtré vide', () => {
    // Contraintes maximales : tous les allergènes EU14 + vegan + aucun équipement
    // → aucune recette du catalogue ne peut passer ces trois filtres cumulés.
    const allergenFiltered = filterRecipes(allRecettes(), {
      allergenes_groupe: [...EU14_ALLERGENS],
      equipement_disponible: [],
    });
    const filtered = filterByExclusions(allergenFiltered, { exclusions_groupe: ['vegan'] });
    expect(filtered.length).toBe(0);
    // Contrat documenté : la couche appelante DOIT détecter ce cas (filtered.length === 0)
    // et remonter une erreur explicite à l'utilisateur. Jamais continuer silencieusement.
    // La gestion UI sera implémentée dans le module de génération de planning.
  });

});
