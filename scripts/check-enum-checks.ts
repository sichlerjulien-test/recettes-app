/**
 * Vérifie que chaque paire (enum Zod, table.colonne) du registre ENUM_CONTRACT
 * est en égalité d'ensembles avec le CHECK d'appartenance correspondant dans
 * schema/canonical.sql. Gate CI statique (ADR-015, jumeau de check-read-contract.ts).
 *
 * Usage : npx tsx scripts/check-enum-checks.ts
 * Exit 0 = OK, exit 1 = divergences (listées sur stderr).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENUM_CONTRACT, type EnumContractEntry } from '../src/lib/db/enum-contract';

export interface MismatchEntry {
  key: string;
  zodOnly: string[];
  sqlOnly: string[];
}

/**
 * Parse les CHECK d'appartenance scalaires (`col = ANY (ARRAY[...])`) de canonical.sql.
 * Retourne une Map<"table.colonne" → Set<valeurs SQL>>.
 */
export function parseSqlMembershipChecks(sql: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  let currentTable: string | null = null;

  for (const line of sql.split('\n')) {
    const tableMatch = line.match(/^CREATE TABLE public\.(\w+)\s*\(/);
    if (tableMatch) {
      currentTable = tableMatch[1] ?? null;
      continue;
    }

    if (currentTable === null) continue;

    if (line.trim() === ');') {
      currentTable = null;
      continue;
    }

    const constraintMatch = line.match(
      /CONSTRAINT \w+ CHECK \(\((\w+) = ANY \(ARRAY\[([^\]]+)\]\)\)\)/,
    );
    if (constraintMatch) {
      const column = constraintMatch[1];
      const arrayContent = constraintMatch[2];
      if (column === undefined || arrayContent === undefined) continue;
      const values = new Set<string>();
      for (const m of arrayContent.matchAll(/'([^']+)'::/g)) {
        if (m[1] !== undefined) values.add(m[1]);
      }
      result.set(`${currentTable}.${column}`, values);
    }
  }

  return result;
}

/**
 * Compare chaque entrée du contrat aux valeurs extraites de canonical.sql.
 * Retourne la liste des divergences (vide si tout est aligné).
 */
export function findEnumMismatches(
  contract: readonly EnumContractEntry[],
  sqlChecks: Map<string, Set<string>>,
): MismatchEntry[] {
  const mismatches: MismatchEntry[] = [];

  for (const { table, column, values: zodValues } of contract) {
    const key = `${table}.${column}`;
    const sqlValues = sqlChecks.get(key);

    if (sqlValues === undefined) {
      mismatches.push({ key, zodOnly: [], sqlOnly: [] });
      continue;
    }

    const zodSet = new Set(zodValues);
    const zodOnly = [...zodSet].filter(v => !sqlValues.has(v));
    const sqlOnly = [...sqlValues].filter(v => !zodSet.has(v));

    if (zodOnly.length > 0 || sqlOnly.length > 0) {
      mismatches.push({ key, zodOnly, sqlOnly });
    }
  }

  return mismatches;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const sql = readFileSync(join(process.cwd(), 'schema/canonical.sql'), 'utf8');
  const sqlChecks = parseSqlMembershipChecks(sql);
  const mismatches = findEnumMismatches(ENUM_CONTRACT, sqlChecks);

  if (mismatches.length > 0) {
    process.stderr.write('[check-enum-checks] FAIL — divergences enum Zod ↔ CHECK SQL :\n');
    for (const m of mismatches) {
      if (m.zodOnly.length > 0) {
        process.stderr.write(
          `  - ${m.key}: dans Zod, absent du CHECK SQL — ${m.zodOnly.join(', ')}\n`,
        );
      }
      if (m.sqlOnly.length > 0) {
        process.stderr.write(
          `  - ${m.key}: dans le CHECK SQL, absent de Zod — ${m.sqlOnly.join(', ')}\n`,
        );
      }
      if (m.zodOnly.length === 0 && m.sqlOnly.length === 0) {
        process.stderr.write(`  - ${m.key}: CHECK introuvable dans canonical.sql\n`);
      }
    }
    process.exit(1);
  }

  console.log('[check-enum-checks] OK — toutes les paires enum Zod ↔ CHECK SQL sont alignées');
}
