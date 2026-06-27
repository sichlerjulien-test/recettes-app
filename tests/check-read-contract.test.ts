import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSchemaColumns, findMissingColumns } from '../scripts/check-read-contract';
import { READ_CONTRACT } from '../src/lib/db/read-contract';

const CANONICAL_SQL = readFileSync(
  join(process.cwd(), 'schema/canonical.sql'),
  'utf8',
);

describe('check-read-contract', () => {
  it('(a) état corrigé → 0 colonne manquante', () => {
    const schemaColumns = parseSchemaColumns(CANONICAL_SQL);
    const missing = findMissingColumns(READ_CONTRACT, schemaColumns);
    expect(missing).toHaveLength(0);
  });

  it('(b) ingredients.fake → exit 1 nommant ingredients.fake', () => {
    const schemaColumns = parseSchemaColumns(CANONICAL_SQL);
    const fakeContract = {
      ...READ_CONTRACT,
      ingredients: [...(READ_CONTRACT.ingredients ?? []), 'fake'],
    };
    const missing = findMissingColumns(fakeContract, schemaColumns);
    expect(missing).toContain('ingredients.fake');
  });
});
