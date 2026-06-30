import { describe, it, expect } from 'vitest';
import { resolvePlanningState } from './resolve-planning-state';
import type { Planning } from '@/lib/types/domain';

const stubPlanning: Planning = {
  id: 'plan-1',
  sejour_id: 'sejour-1',
  entries: [],
  genere_le: '2025-01-01T00:00:00Z',
  contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
};

describe('resolvePlanningState', () => {
  it('ok → status ok avec le planning passé tel quel', () => {
    const result = resolvePlanningState({ ok: true, planning: stubPlanning });
    expect(result).toEqual({ status: 'ok', planning: stubPlanning });
  });

  it('not_found → status empty (pas encore généré)', () => {
    const result = resolvePlanningState({
      ok: false,
      error: { kind: 'not_found', entity: 'planning', id: 'sejour-1' },
    });
    expect(result).toEqual({ status: 'empty' });
  });

  it('query_failed → status error (erreur DB)', () => {
    const result = resolvePlanningState({
      ok: false,
      error: { kind: 'query_failed', cause: 'DB timeout' },
    });
    expect(result).toEqual({ status: 'error' });
  });

  it('row_validation_failed → status error (données corrompues)', () => {
    const result = resolvePlanningState({
      ok: false,
      error: { kind: 'row_validation_failed', cause: 'invalid schema' },
    });
    expect(result).toEqual({ status: 'error' });
  });
});
