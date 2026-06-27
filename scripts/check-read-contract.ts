/**
 * Vérifie que toutes les colonnes déclarées dans READ_CONTRACT existent dans
 * schema/canonical.sql. Gate CI statique : contrat de lecture ⊆ canonical (ADR-014 §4).
 *
 * Existence seule — type et nullabilité sont couverts par ADR-013 (schema-replay).
 * Usage : npx tsx scripts/check-read-contract.ts
 * Exit 0 = OK, exit 1 = colonnes manquantes (listées sur stderr).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_CONTRACT } from '../src/lib/db/read-contract';

// Parse les blocs CREATE TABLE pour extraire { "table.colonne" }
export function parseSchemaColumns(sql: string): Set<string> {
  const schemaColumns = new Set<string>();
  let currentTable: string | null = null;

  for (const line of sql.split('\n')) {
    const tableMatch = line.match(/^CREATE TABLE public\.(\w+)\s*\(/);
    if (tableMatch) {
      currentTable = tableMatch[1] ?? null;
      continue;
    }

    if (currentTable === null) continue;

    if (line === ');') {
      currentTable = null;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('CONSTRAINT')) continue;

    // Le nom de colonne est le premier token, potentiellement entre guillemets (ex. "position")
    const colMatch = trimmed.match(/^"?(\w+)"?\s/);
    if (colMatch) schemaColumns.add(`${currentTable}.${colMatch[1]}`);
  }

  return schemaColumns;
}

// Confronter un contrat au schéma extrait ; retourne les clés manquantes
export function findMissingColumns(
  contract: Record<string, readonly string[]>,
  schemaColumns: Set<string>,
): string[] {
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(contract)) {
    for (const col of cols) {
      if (!schemaColumns.has(`${table}.${col}`)) {
        missing.push(`${table}.${col}`);
      }
    }
  }
  return missing;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const sql = readFileSync(join(process.cwd(), 'schema/canonical.sql'), 'utf8');
  const schemaColumns = parseSchemaColumns(sql);
  const missing = findMissingColumns(READ_CONTRACT, schemaColumns);

  if (missing.length > 0) {
    process.stderr.write(`[check-read-contract] FAIL — colonnes requises absentes de schema/canonical.sql :\n`);
    for (const col of missing) {
      process.stderr.write(`  - ${col}\n`);
    }
    process.exit(1);
  }

  console.log('[check-read-contract] OK — toutes les colonnes du contrat sont présentes dans canonical.sql');
}
