/**
 * Gate CI anti-interpolation d'internals dans l'arg 3 (message) de jsonError
 * (ADR-025, TK-66 — anti-récidive de la classe TK-59).
 *
 * Allowlist en arg 3 : littéral string, template literal à interpolations
 * exclusivement littérales, ou appel businessMessage(...). Tout le reste
 * échoue. Arg 4 (details) est hors périmètre.
 *
 * Usage : npx tsx scripts/check-jsonerror-message.ts
 * Exit 0 = OK, exit 1 = interpolations non wrappées (listées sur stderr avec file:line).
 */

import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = 'src';

export interface JsonErrorViolation {
  file: string;
  line: number;
}

/**
 * Un template literal est « sûr » si toutes ses expressions interpolées
 * sont elles-mêmes des littéraux (string/numérique) ou des templates
 * récursivement sûrs. Tout accès-membre, identifiant, appel (hors
 * businessMessage, géré en amont) fait échouer.
 */
function isLiteralOnlyTemplate(node: ts.TemplateExpression): boolean {
  return node.templateSpans.every(span => {
    const expr = span.expression;
    if (ts.isStringLiteralLike(expr) || ts.isNumericLiteral(expr)) return true;
    if (ts.isTemplateExpression(expr)) return isLiteralOnlyTemplate(expr);
    return false;
  });
}

function isBusinessMessageCall(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'businessMessage'
  );
}

/** true = arg 3 conforme à l'allowlist ADR-025. */
function isAllowedMessageArg(arg: ts.Expression): boolean {
  if (ts.isStringLiteralLike(arg)) return true; // string literal ou no-substitution template
  if (ts.isTemplateExpression(arg)) return isLiteralOnlyTemplate(arg);
  if (isBusinessMessageCall(arg)) return true;
  return false;
}

/**
 * Extrait tous les appels jsonError(...) du source fourni et évalue la
 * conformité de leur arg 3 (index 2) à l'allowlist ADR-025.
 */
export function findJsonErrorViolations(
  source: string,
  filename = 'input.ts',
): JsonErrorViolation[] {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const violations: JsonErrorViolation[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'jsonError'
    ) {
      const arg3 = node.arguments[2];
      if (arg3 !== undefined && !isAllowedMessageArg(arg3)) {
        const line = sourceFile.getLineAndCharacterOfPosition(arg3.getStart()).line + 1;
        violations.push({ file: filename, line });
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return violations;
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = listSourceFiles(join(process.cwd(), SRC_DIR));
  const violations: JsonErrorViolation[] = [];

  for (const absPath of files) {
    const relPath = absPath.slice(process.cwd().length + 1);
    const content = readFileSync(absPath, 'utf8');
    violations.push(...findJsonErrorViolations(content, relPath));
  }

  if (violations.length > 0) {
    process.stderr.write(
      '[check-jsonerror-message] FAIL — arg 3 de jsonError hors allowlist ADR-025 :\n',
    );
    for (const v of violations) {
      process.stderr.write(`  - ${v.file}:${v.line}\n`);
    }
    process.exit(1);
  }

  console.log('[check-jsonerror-message] OK — tous les appels jsonError respectent ADR-025');
}
