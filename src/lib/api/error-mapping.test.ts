import { vi, describe, it, expect, afterEach } from 'vitest';
import { dbErrorToResponse } from './error-mapping';

describe('dbErrorToResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('row_validation_failed : message générique sans le détail interne, cause loggée', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = dbErrorToResponse({
      kind: 'row_validation_failed',
      cause: 'exclusions_compatibles: Expected array, received null',
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.message).not.toContain('exclusions_compatibles');
    expect(body.error.message).not.toContain('Expected');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('row_validation_failed'),
      'exclusions_compatibles: Expected array, received null',
    );
  });

  it('schema_drift : message générique sans noms de table/colonne, missing loggé', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = dbErrorToResponse({
      kind: 'schema_drift',
      missing: [{ table: 'recettes', column: 'foo' }],
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.message).not.toContain('foo');
    expect(body.error.message).not.toContain('recettes');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('schema_drift'),
      [{ table: 'recettes', column: 'foo' }],
    );
  });

  it('constraint_violation : conserve le message métier tel quel', async () => {
    const res = dbErrorToResponse({ kind: 'constraint_violation', cause: 'Séjour introuvable' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toBe('Séjour introuvable');
  });

  it('not_found : conserve le format "{entity} introuvable"', async () => {
    const res = dbErrorToResponse({ kind: 'not_found', entity: 'Séjour', id: 'abc' });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.message).toBe('Séjour introuvable');
  });
});
