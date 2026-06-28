/**
 * Vérifie que chaque colonne lue via bracket notation dans les fonctions de
 * mapping DAL est déclarée dans READ_CONTRACT.
 * Gate CI statique : DAL reads ⊆ READ_CONTRACT (complément de check-read-contract.ts).
 *
 * Usage : npx tsx scripts/check-dal-reads.ts
 * Exit 0 = OK, exit 1 = dérives (listées sur stderr avec fichier + numéro de ligne).
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_CONTRACT } from '../src/lib/db/read-contract';

// Fichiers DAL à analyser, groupés par table couverte dans READ_CONTRACT.
// sejours.ts exclu : la table sejours n'est pas (encore) dans READ_CONTRACT.
const DAL_FILES_BY_TABLE: Record<string, string[]> = {
  recettes: ['src/lib/db/recettes.ts'],
  recette_ingredients: ['src/lib/db/recettes.ts'],
  ingredients: ['src/lib/db/ingredients.ts'],
  plannings: ['src/lib/db/plannings.ts'],
};

export interface DriftEntry {
  file: string;
  column: string;
  line: number;
}

/**
 * Extrait tous les accès par bracket notation avec un string literal
 * (ex. `row['colname']`) depuis le source TypeScript fourni.
 */
export function extractBracketAccesses(
  source: string,
  filename = 'input.ts',
): { column: string; line: number }[] {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const result: { column: string; line: number }[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const column = node.argumentExpression.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      result.push({ column, line });
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return result;
}

/**
 * Pour chaque fichier dans fileContents, extrait les bracket accesses et
 * détecte ceux qui ne figurent pas dans READ_CONTRACT pour les tables
 * couvertes par ce fichier.
 *
 * Règle de skip : si la clé d'accès est elle-même un nom de table dans
 * readContract (ex. row['recette_ingredients']), c'est un résultat de join —
 * pas une colonne scalaire — et on l'ignore.
 */
export function findDriftedReads(
  fileContents: Map<string, string>,
  dalFilesByTable: Record<string, string[]>,
  readContract: Record<string, readonly string[]>,
): DriftEntry[] {
  const tableNames = new Set(Object.keys(readContract));

  // Map inverse : fichier → set de colonnes autorisées (union des tables du fichier)
  const allowedByFile = new Map<string, Set<string>>();
  for (const [table, files] of Object.entries(dalFilesByTable)) {
    const cols = readContract[table] ?? [];
    for (const file of files) {
      const allowed = allowedByFile.get(file) ?? new Set<string>();
      for (const col of cols) allowed.add(col);
      allowedByFile.set(file, allowed);
    }
  }

  const drifts: DriftEntry[] = [];

  for (const [file, content] of fileContents) {
    const allowed = allowedByFile.get(file);
    if (allowed === undefined) continue; // fichier hors périmètre → ignoré

    const accesses = extractBracketAccesses(content, file);
    for (const { column, line } of accesses) {
      if (tableNames.has(column)) continue; // résultat de join → skip
      if (!allowed.has(column)) {
        drifts.push({ file, column, line });
      }
    }
  }

  return drifts;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const fileContents = new Map<string, string>();
  const seen = new Set<string>();
  for (const files of Object.values(DAL_FILES_BY_TABLE)) {
    for (const f of files) {
      if (!seen.has(f)) {
        seen.add(f);
        fileContents.set(f, readFileSync(join(process.cwd(), f), 'utf8'));
      }
    }
  }

  const drifts = findDriftedReads(fileContents, DAL_FILES_BY_TABLE, READ_CONTRACT);

  if (drifts.length > 0) {
    process.stderr.write('[check-dal-reads] FAIL — colonnes lues hors contrat :\n');
    for (const d of drifts) {
      process.stderr.write(`  - ${d.file}:${d.line} → '${d.column}'\n`);
    }
    process.exit(1);
  }

  console.log('[check-dal-reads] OK — toutes les lectures DAL sont couvertes par READ_CONTRACT');
}
