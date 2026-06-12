// Tests de la sentinelle NULL sur exclusions_compatibles (migration 009).
//
// (a) NULL en base → erreur explicite, jamais de faux pool_empty.
// (b) [] matérialisé → filterByExclusions fonctionne : la recette est exclue
//     correctement sans crasher.

import { describe, it, expect } from 'vitest';
import { requireExclusionsCompatibles } from '@/lib/db/recette-row-helpers';
import { filterByExclusions } from '@/lib/dietary/filter';
import type { Recette } from '@/lib/types/domain';

// ─── (a) Sentinelle NULL ────────────────────────────────────────────────────

describe('requireExclusionsCompatibles — sentinelle NULL', () => {
  it("null → erreur explicite contenant l'id de la recette", () => {
    expect(() => requireExclusionsCompatibles(null, 'croque-monsieur')).toThrow(
      /exclusions_compatibles non matérialisé pour recette croque-monsieur/,
    );
  });

  it('undefined → même erreur explicite', () => {
    expect(() => requireExclusionsCompatibles(undefined, 'croque-monsieur')).toThrow(
      /exclusions_compatibles non matérialisé/,
    );
  });

  it('[] matérialisé → retourne [] sans erreur', () => {
    expect(requireExclusionsCompatibles([], 'croque-monsieur')).toEqual([]);
  });

  it('tags matérialisés → retournés tels quels', () => {
    const tags = ['sans-porc', 'sans-alcool'];
    expect(requireExclusionsCompatibles(tags, 'quiche-lorraine')).toBe(tags);
  });
});

// ─── (b) [] matérialisé → filtre correct, pas de crash ──────────────────────

describe('filterByExclusions — recette à [] matérialisé correctement exclue', () => {
  // Simule une recette dont build-data a calculé exclusions_compatibles = []
  // (recette contenant de la viande, du porc, etc. — incompatible avec tout tag).
  const croqueMonssieur: Recette = {
    id: 'croque-monsieur',
    nom: 'Croque-monsieur',
    description: 'Croque-monsieur au jambon.',
    portions_base: 2,
    duree_minutes: 10,
    duree_active: 10,
    difficulte: 'facile',
    equipement: ['plaque'],
    type_repas: ['midi'],
    type_cuisine: 'francaise',
    saison: ['toutes'],
    ingredient_principal: 'porc',
    feculent_dominant: 'pain',
    ingredients: [],
    etapes: [],
    tags_libres: [],
    allergenes_calcules: [],
    exclusions_compatibles: [],
  };

  it('exclu du pool vegetarien ([] ne contient pas vegetarien) — pas de crash', () => {
    const pool = filterByExclusions([croqueMonssieur], { exclusions_groupe: ['vegetarien'] });
    expect(pool).toHaveLength(0);
  });

  it('exclu du pool sans-porc — pas de crash', () => {
    const pool = filterByExclusions([croqueMonssieur], { exclusions_groupe: ['sans-porc'] });
    expect(pool).toHaveLength(0);
  });

  it('aucune exclusion demandée → recette conservée, pas de crash', () => {
    const pool = filterByExclusions([croqueMonssieur], { exclusions_groupe: [] });
    expect(pool).toHaveLength(1);
  });
});
