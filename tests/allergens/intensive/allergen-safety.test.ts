import { describe, expect, it } from 'vitest';
import type { FilterConstraints } from '@/lib/allergens/filter';
import type { Participant, Planning } from '@/lib/types/domain';
import { filterRecipes } from '@/lib/allergens/filter';
import { validatePlanning } from '@/lib/allergens/validator';
import {
  participantAllergiesMultiples,
  participantCoeliaque,
  participantCoeliaqueVegan,
  participantSansContrainte,
  participantVegan,
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

const ALL_EQUIPMENT: FilterConstraints['equipement_disponible'] = [
  'four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot',
];

function buildPlanning(recetteIds: string[]): Planning {
  return {
    id: 'planning-intensif',
    sejour_id: 'sejour-intensif',
    entries: recetteIds.map((recette_id, i) => ({
      jour: Math.floor(i / 2) + 1,
      repas: i % 2 === 0 ? ('midi' as const) : ('soir' as const),
      recette_id,
      portions: 6,
    })),
    genere_le: '2026-04-21T00:00:00Z',
    contraintes_utilisees: { allergenes: [], regimes: [], equipement: [] },
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function runProfile(
  label: string,
  participants: Participant[],
  constraints: FilterConstraints,
  seed: number,
  iterations: number,
): void {
  const rng = mulberry32(seed);
  const catalogue = allRecettes();

  for (let i = 0; i < iterations; i++) {
    const filtered = filterRecipes(catalogue, constraints);
    if (filtered.length === 0) continue;

    const nb = Math.min(Math.floor(rng() * 5) + 1, filtered.length);
    const selected: string[] = [];
    for (let j = 0; j < nb; j++) {
      selected.push(pickRandom(filtered, rng).id);
    }

    const planning = buildPlanning(selected);
    const result = validatePlanning(planning, recettesMap, participants);

    if (!result.valid) {
      throw new Error(
        `[${label}] Iteration ${i + 1}: Planning invalide après filtrage.\n` +
        `Recettes sélectionnées : ${selected.join(', ')}\n` +
        `Violations : ${JSON.stringify(result.violations, null, 2)}`,
      );
    }
  }
}

describe('allergen-safety (500 iterations)', () => {

  it('profil coeliaque: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'coeliaque',
      [participantCoeliaque],
      { allergenes_groupe: ['gluten'], regimes_groupe: [], equipement_disponible: ALL_EQUIPMENT },
      0x1A2B3C4D,
      100,
    );
  });

  it('profil vegan: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'vegan',
      [participantVegan],
      { allergenes_groupe: [], regimes_groupe: ['vegan'], equipement_disponible: ALL_EQUIPMENT },
      0x2B3C4D5E,
      100,
    );
  });

  it('profil coeliaque+vegan: 100 plannings filtrés sont tous valides', () => {
    runProfile(
      'coeliaque+vegan',
      [participantCoeliaqueVegan],
      { allergenes_groupe: ['gluten'], regimes_groupe: ['vegan'], equipement_disponible: ALL_EQUIPMENT },
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
        regimes_groupe: participantAllergiesMultiples.regimes,
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
    ] as FilterConstraints['allergenes_groupe'];
    const regimes = [
      ...new Set(participants.flatMap((p) => p.regimes)),
    ] as FilterConstraints['regimes_groupe'];

    runProfile(
      'groupe-mixte',
      participants,
      { allergenes_groupe: allergenes, regimes_groupe: regimes, equipement_disponible: ALL_EQUIPMENT },
      0x5E6F7081,
      100,
    );
  });

});
