/**
 * Gate CI unifié DAL reads ⊆ READ_CONTRACT (ADR-016 — TK-34).
 *
 * Deux branches de vérification :
 *  - Précise : accès dans une fonction de mapping connue (FUNCTION_TO_TABLE)
 *    → contrôle contre la table dédiée de cette fonction.
 *  - Large : accès hors fonction connue → contrôle contre l'union des tables du fichier.
 *
 * Usage : npx tsx scripts/check-dal-reads.ts
 * Exit 0 = OK, exit 1 = dérives (listées sur stderr avec fichier + numéro de ligne).
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_CONTRACT } from '../src/lib/db/read-contract';

// Attribution fonction → table (surface maintenue manuellement — ADR-016).
export const FUNCTION_TO_TABLE: Record<string, string> = {
  mapRecetteRow: 'recettes',
  mapRecetteIngredientRow: 'recette_ingredients',
  byPosition: 'recette_ingredients',
  mapIngredientRow: 'ingredients',
};

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
 * Inclut le nom de la FunctionDeclaration englobante la plus proche (ou null).
 */
export function extractBracketAccesses(
  source: string,
  filename = 'input.ts',
): { column: string; line: number; enclosingFn: string | null }[] {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const result: { column: string; line: number; enclosingFn: string | null }[] = [];

  function getEnclosingFnName(node: ts.Node): string | null {
    let current: ts.Node = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }
      current = current.parent;
    }
    return null;
  }

  function visit(node: ts.Node): void {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const column = node.argumentExpression.text;
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const enclosingFn = getEnclosingFnName(node);
      result.push({ column, line, enclosingFn });
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return result;
}

/**
 * Pour chaque fichier dans fileContents, extrait les bracket accesses et
 * détecte les dérives par rapport à READ_CONTRACT.
 *
 * Règle de skip : clé == nom de table dans readContract → résultat de join, ignoré.
 * Branche précise : accès dans une fonction de functionToTable → contrôle sa table dédiée.
 * Branche large : accès hors fonction connue → contrôle l'union des tables du fichier.
 */
export function findDriftedReads(
  fileContents: Map<string, string>,
  dalFilesByTable: Record<string, string[]>,
  readContract: Record<string, readonly string[]>,
  functionToTable: Record<string, string> = FUNCTION_TO_TABLE,
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
    if (!allowedByFile.has(file)) continue; // fichier hors périmètre → ignoré

    const accesses = extractBracketAccesses(content, file);
    for (const { column, line, enclosingFn } of accesses) {
      if (tableNames.has(column)) continue; // résultat de join → skip

      const table = enclosingFn !== null ? functionToTable[enclosingFn] : undefined;

      if (table !== undefined) {
        // Branche précise : contrôle la table dédiée de la fonction
        const contractCols = new Set(readContract[table] ?? []);
        if (!contractCols.has(column)) {
          drifts.push({ file, column, line });
        }
      } else {
        // Branche large : union des tables du fichier
        const allowed = allowedByFile.get(file)!;
        if (!allowed.has(column)) {
          drifts.push({ file, column, line });
        }
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
