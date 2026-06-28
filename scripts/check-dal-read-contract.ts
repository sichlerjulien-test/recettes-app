/**
 * Gate TK-32 : accès bracket-string des fonctions de mapping ⊆ READ_CONTRACT
 *
 * Pour chaque fonction de mapping du DAL, extrait les accès row['colonne'] via
 * l'AST TypeScript et vérifie que chaque colonne accédée est déclarée dans
 * READ_CONTRACT pour la table correspondante. Rougit si une colonne manque dans
 * le contrat (protection contre les accès implicites non déclarés).
 *
 * NE vérifie PAS la direction inverse (colonnes déclarées mais non lues).
 */

import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_CONTRACT } from '../src/lib/db/read-contract';

// Attribution fonction → table (dérivée de l'analyse des fichiers DAL)
const FUNCTION_TO_TABLE: Record<string, string> = {
  mapRecetteRow: 'recettes',
  mapRecetteIngredientRow: 'recette_ingredients',
  byPosition: 'recette_ingredients',
  mapIngredientRow: 'ingredients',
};

// Clés à ignorer : artefacts de jointure, pas des colonnes de la table mappée.
// 'recette_ingredients' apparaît dans mapRecetteRow via row['recette_ingredients']
// mais représente le sous-objet imbriqué renvoyé par Supabase, pas une colonne de recettes.
const IGNORE_KEYS = new Set(['recette_ingredients']);

/** Extrait les accès bracket-string par fonction de mapping depuis le source TS. */
export function extractStringAccesses(
  source: string,
  fileName = 'input.ts',
): Map<string, Set<string>> {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const result = new Map<string, Set<string>>();

  function walkAccesses(node: ts.Node, funcName: string): void {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const key = node.argumentExpression.text;
      if (!IGNORE_KEYS.has(key)) {
        let s = result.get(funcName);
        if (!s) { s = new Set(); result.set(funcName, s); }
        s.add(key);
      }
    }
    ts.forEachChild(node, child => walkAccesses(child, funcName));
  }

  ts.forEachChild(sf, node => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      if (name in FUNCTION_TO_TABLE) {
        walkAccesses(node, name);
      }
    }
  });

  return result;
}

/** Retourne les violations <table>.<colonne> hors READ_CONTRACT. */
export function checkAccesses(
  accessesByFunc: Map<string, Set<string>>,
): string[] {
  const violations: string[] = [];
  for (const [funcName, keys] of accessesByFunc) {
    const table = FUNCTION_TO_TABLE[funcName];
    if (!table) continue;
    const contractKeys = new Set<string>(READ_CONTRACT[table] ?? []);
    for (const key of keys) {
      if (!contractKeys.has(key)) {
        violations.push(`${table}.${key}`);
      }
    }
  }
  return violations;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const dalFiles = [
    join(process.cwd(), 'src/lib/db/recettes.ts'),
    join(process.cwd(), 'src/lib/db/ingredients.ts'),
  ];

  const allAccesses = new Map<string, Set<string>>();
  for (const file of dalFiles) {
    const source = readFileSync(file, 'utf8');
    for (const [func, keys] of extractStringAccesses(source, file)) {
      let s = allAccesses.get(func);
      if (!s) { s = new Set(); allAccesses.set(func, s); }
      for (const k of keys) s.add(k);
    }
  }

  const violations = checkAccesses(allAccesses);
  if (violations.length > 0) {
    process.stderr.write('[check-dal-read-contract] FAIL — accès DAL hors READ_CONTRACT :\n');
    for (const v of violations) {
      process.stderr.write(`  - ${v}\n`);
    }
    process.exit(1);
  }

  console.log('[check-dal-read-contract] OK — tous les accès DAL sont dans le READ_CONTRACT');
}
