import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSqlMembershipChecks, findEnumMismatches } from '../scripts/check-enum-checks';
import { ENUM_CONTRACT } from '../src/lib/db/enum-contract';

const CANONICAL_SQL = readFileSync(
  join(process.cwd(), 'schema/canonical.sql'),
  'utf8',
);

describe('check-enum-checks', () => {
  it('(a) état actuel → 0 divergence', () => {
    const checks = parseSqlMembershipChecks(CANONICAL_SQL);
    const mismatches = findEnumMismatches(ENUM_CONTRACT, checks);
    expect(mismatches).toHaveLength(0);
  });

  it('(b) valeur Zod absente du CHECK SQL → exit 1 nommant colonne+valeur', () => {
    // Retire 'facile' du CHECK recettes_difficulte_check pour simuler une dérive SQL
    const fakeSql = CANONICAL_SQL.replace(
      "'facile'::text, 'normale'::text",
      "'normale'::text",
    );
    const checks = parseSqlMembershipChecks(fakeSql);
    const mismatches = findEnumMismatches(ENUM_CONTRACT, checks);
    const m = mismatches.find(x => x.key === 'recettes.difficulte');
    expect(m).toBeDefined();
    expect(m?.zodOnly).toContain('facile');
  });

  it('(c) valeur CHECK SQL absente de Zod → exit 1 nommant colonne+valeur', () => {
    // Injecte 'inconnue' dans le CHECK recettes_difficulte_check
    const fakeSql = CANONICAL_SQL.replace(
      "'facile'::text, 'normale'::text",
      "'facile'::text, 'normale'::text, 'inconnue'::text",
    );
    const checks = parseSqlMembershipChecks(fakeSql);
    const mismatches = findEnumMismatches(ENUM_CONTRACT, checks);
    const m = mismatches.find(x => x.key === 'recettes.difficulte');
    expect(m).toBeDefined();
    expect(m?.sqlOnly).toContain('inconnue');
  });
});
