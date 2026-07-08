import { describe, it, expect } from 'vitest';
import { findJsonErrorViolations } from '../scripts/check-jsonerror-message';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('findJsonErrorViolations', () => {
  it('littéral en arg 3 → pass', () => {
    const source = `jsonError(400, 'validation_failed', 'Données invalides');`;
    expect(findJsonErrorViolations(source)).toHaveLength(0);
  });

  it('template à interpolation non approuvée en arg 3 → fail, file:line correcte', () => {
    const source = `
function f(error: { entity: string }) {
  return jsonError(404, 'not_found', \`\${error.entity} introuvable\`);
}`;
    const violations = findJsonErrorViolations(source, 'fake.ts');
    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe('fake.ts');
    expect(violations[0]?.line).toBe(3);
  });

  it('membre direct non approuvé en arg 3 → fail', () => {
    const source = `
function f(error: { cause: string }) {
  return jsonError(400, 'business_error', error.cause);
}`;
    const violations = findJsonErrorViolations(source);
    expect(violations).toHaveLength(1);
  });

  it('businessMessage(...) en arg 3, y compris avec template interne → pass', () => {
    const source = `
function f(error: { entity: string; cause: string }) {
  jsonError(400, 'business_error', businessMessage(error.cause));
  jsonError(404, 'not_found', businessMessage(\`\${error.entity} introuvable\`));
}`;
    expect(findJsonErrorViolations(source)).toHaveLength(0);
  });

  it('interpolation en arg 4 (details) → pass, ne se déclenche pas', () => {
    const source = `
function f(error: { flatten: () => unknown }) {
  return jsonError(400, 'validation_failed', 'Données invalides', error.flatten());
}`;
    expect(findJsonErrorViolations(source)).toHaveLength(0);
  });

  it('no-substitution template literal en arg 3 → pass', () => {
    const source = 'jsonError(500, \'db_error\', `Erreur côté base de données`);';
    expect(findJsonErrorViolations(source)).toHaveLength(0);
  });
});

describe('check-jsonerror-message — fichiers réels', () => {
  it('état actuel de src/ → 0 violation', () => {
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

    const srcDir = join(process.cwd(), 'src');
    const violations = [];
    for (const absPath of listSourceFiles(srcDir)) {
      const relPath = absPath.slice(process.cwd().length + 1);
      const content = readFileSync(absPath, 'utf8');
      violations.push(...findJsonErrorViolations(content, relPath));
    }

    if (violations.length > 0) {
      console.error('Violations détectées :');
      for (const v of violations) console.error(`  ${v.file}:${v.line}`);
    }
    expect(violations).toHaveLength(0);
  });
});
