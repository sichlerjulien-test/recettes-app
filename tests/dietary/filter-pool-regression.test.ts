// Régression P0 — tags atomiques isolés ne doivent pas vider le pool.
//
// Cause racine : mapRecetteRow reconstruisait exclusions_compatibles depuis
// est_vegetarien/est_vegan uniquement. Les 5 tags atomiques étaient perdus.
// Sélectionner 'sans-porc' seul vidait le pool à tort via filter.ts:27.
//
// Ce fichier prouve que filterByExclusions fonctionne correctement quand
// exclusions_compatibles est la sortie de computeDietaryMetadata (source de vérité).

import { describe, it, expect } from 'vitest';
import { filterByExclusions } from '@/lib/dietary/filter';
import { allRecettes } from '../fixtures/recettes';

describe('filter régression P0 — tag atomique seul ne vide pas le pool', () => {
  const catalogue = allRecettes();

  it('sans-porc seul : pool non vide car des recettes sans porc existent', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-porc'] });
    expect(pool.length, 'sans-porc seul vide le pool — régression P0 non résolue').toBeGreaterThan(0);
  });

  it('sans-viande-rouge seul : pool non vide', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-viande-rouge'] });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('sans-alcool seul : pool non vide', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-alcool'] });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('sans-poisson seul : pool non vide', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-poisson'] });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('sans-fruits-de-mer seul : pool non vide', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-fruits-de-mer'] });
    expect(pool.length).toBeGreaterThan(0);
  });

  it('sans-porc isolé : les recettes vegan passent le filtre (contrôle positif)', () => {
    const pool = filterByExclusions(catalogue, { exclusions_groupe: ['sans-porc'] });
    const vegan = pool.filter((r) => r.exclusions_compatibles.includes('vegan'));
    expect(vegan.length, 'aucune recette vegan dans le pool sans-porc — tags atomiques absents').toBeGreaterThan(0);
  });
});
