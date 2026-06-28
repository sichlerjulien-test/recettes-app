import { describe, it, expect } from 'vitest';
import { extractBracketAccesses, findDriftedReads } from '../scripts/check-dal-reads';
import { READ_CONTRACT } from '../src/lib/db/read-contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── fixtures synthétiques ────────────────────────────────────────────────────

const SOURCE_AVEC_DERIVE = `
function mapFakeRow(item: unknown): unknown {
  const row = item as Record<string, unknown>;
  return {
    id: row['id'],
    col_hors_contrat: row['col_hors_contrat'],
  };
}
`;

const SOURCE_SANS_DERIVE = `
function mapFakeRow(item: unknown): unknown {
  const row = item as Record<string, unknown>;
  return {
    id: row['id'],
    nom: row['nom'],
  };
}
`;

const SOURCE_AVEC_JOIN = `
function mapRecetteRow(item: unknown): unknown {
  const row = item as Record<string, unknown>;
  const rawIngredients = row['recette_ingredients'];
  return { id: row['id'], ingredients: rawIngredients };
}
`;

const FAKE_CONTRACT: Record<string, readonly string[]> = {
  fake: ['id', 'nom'],
};

// dalFilesByTable : clés = noms de table, valeurs = fichiers DAL (même convention que le script)
const FAKE_DAL_FILES: Record<string, string[]> = {
  fake: ['src/lib/db/fake.ts'],
};

const RECETTES_CONTRACT: Record<string, readonly string[]> = {
  recettes: ['id'],
  recette_ingredients: [],
};

const RECETTES_DAL_FILES: Record<string, string[]> = {
  recettes: ['src/lib/db/recettes.ts'],
  recette_ingredients: ['src/lib/db/recettes.ts'],
};

// ─── tests extractBracketAccesses ────────────────────────────────────────────

describe('extractBracketAccesses', () => {
  it('extrait les clés string depuis bracket notation', () => {
    const accesses = extractBracketAccesses(`const x = row['foo'];`);
    expect(accesses.map(a => a.column)).toContain('foo');
  });

  it("n'extrait pas les accès par variable (row[key])", () => {
    const accesses = extractBracketAccesses(`const x = row[key];`);
    expect(accesses).toHaveLength(0);
  });

  it('extrait sur plusieurs lignes avec numéro de ligne correct', () => {
    const src = `const a = row['alpha'];\nconst b = row['beta'];`;
    const accesses = extractBracketAccesses(src);
    expect(accesses).toHaveLength(2);
    const alpha = accesses.find(a => a.column === 'alpha');
    const beta = accesses.find(a => a.column === 'beta');
    expect(alpha?.line).toBe(1);
    expect(beta?.line).toBe(2);
  });
});

// ─── tests findDriftedReads ───────────────────────────────────────────────────

describe('findDriftedReads', () => {
  it('(a) colonne hors contrat → détectée avec fichier + colonne', () => {
    const contents = new Map([['src/lib/db/fake.ts', SOURCE_AVEC_DERIVE]]);
    const drifts = findDriftedReads(contents, FAKE_DAL_FILES, FAKE_CONTRACT);
    expect(drifts.length).toBeGreaterThan(0);
    const drift = drifts.find(d => d.column === 'col_hors_contrat');
    expect(drift).toBeDefined();
    expect(drift?.file).toBe('src/lib/db/fake.ts');
  });

  it('(b) toutes colonnes déclarées → 0 dérive', () => {
    const contents = new Map([['src/lib/db/fake.ts', SOURCE_SANS_DERIVE]]);
    const drifts = findDriftedReads(contents, FAKE_DAL_FILES, FAKE_CONTRACT);
    expect(drifts).toHaveLength(0);
  });

  it('(c) accès join (nom de table dans READ_CONTRACT) → ignoré', () => {
    const contents = new Map([['src/lib/db/recettes.ts', SOURCE_AVEC_JOIN]]);
    const drifts = findDriftedReads(contents, RECETTES_DAL_FILES, RECETTES_CONTRACT);
    // 'recette_ingredients' est un nom de table → ignoré ; 'id' est dans le contrat
    expect(drifts).toHaveLength(0);
  });

  it('(d) fichier hors périmètre DAL_FILES → ignoré', () => {
    // sejours.ts n'est pas dans FAKE_DAL_FILES → ses accès ne sont pas contrôlés
    const contents = new Map([
      ['src/lib/db/fake.ts', SOURCE_SANS_DERIVE],
      ['src/lib/db/sejours.ts', `const x = row['token'];`],
    ]);
    const drifts = findDriftedReads(contents, FAKE_DAL_FILES, FAKE_CONTRACT);
    expect(drifts).toHaveLength(0);
  });
});

// ─── test sur les fichiers DAL réels ─────────────────────────────────────────

describe('check-dal-reads — fichiers réels', () => {
  it('(e) état actuel → 0 dérive (READ_CONTRACT couvre tout ce que lit le DAL)', () => {
    const DAL_FILES_BY_TABLE: Record<string, string[]> = {
      recettes: ['src/lib/db/recettes.ts'],
      recette_ingredients: ['src/lib/db/recettes.ts'],
      ingredients: ['src/lib/db/ingredients.ts'],
      plannings: ['src/lib/db/plannings.ts'],
    };

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
      console.error('Dérives détectées :');
      for (const d of drifts) console.error(`  ${d.file}:${d.line} → '${d.column}'`);
    }
    expect(drifts).toHaveLength(0);
  });
});
