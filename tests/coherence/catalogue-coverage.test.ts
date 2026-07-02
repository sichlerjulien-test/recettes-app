/**
 * TK-40a — Diagnostic de couverture du catalogue.
 *
 * Pour chaque profil de référence, ce test produit :
 *   - le nombre de recettes distinctes par créneau après filterRecipes + filterByExclusions
 *   - un verdict "tient" | "profondeur insuffisante: <créneau>, <N> distinctes"
 *
 * Il écrit l'artefact reports/catalogue-coverage.json (contenu déterministe,
 * deux runs sur le même catalogue → sortie identique).
 *
 * Non-réimplémentation vérifiable :
 *   - filtrage via filterRecipes (src/lib/allergens/filter.ts)
 *   - filtrage via filterByExclusions (src/lib/dietary/filter.ts)
 *   - seuil de profondeur via RECETTE_DUPLIQUEE_WINDOW_DAYS (src/lib/coherence/)
 *   - aucune constante de cohérence définie dans ce fichier
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { IngredientSchema, RecetteInputSchema } from '../../src/lib/types/schemas';
import type { IngredientOutput } from '../../src/lib/types/schemas';
import type { Recette, MealType, Equipment } from '../../src/lib/types/domain';
import type { ExclusionTag } from '../../src/lib/types/domain';
import { EU14_ALLERGENS } from '../../data/seed-allergenes';
import type { Allergen } from '../../data/seed-allergenes';
import { computeRecipeMetadata } from '../../src/lib/allergens/compute';
import { computeDietaryMetadata } from '../../src/lib/dietary/compute';
import { filterRecipes } from '../../src/lib/allergens/filter';
import { filterByExclusions } from '../../src/lib/dietary/filter';
import { RECETTE_DUPLIQUEE_WINDOW_DAYS } from '../../src/lib/coherence';

const DATA_ROOT = join(process.cwd(), 'data');
const REPORTS_DIR = join(process.cwd(), 'reports');

// ─── Loaders YAML ─────────────────────────────────────────────────────────────

function loadAllIngredients(): Map<string, IngredientOutput> {
  const dir = join(DATA_ROOT, 'ingredients');
  const map = new Map<string, IngredientOutput>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const ingredient = IngredientSchema.parse(parseYaml(readFileSync(join(dir, file), 'utf-8')));
    map.set(ingredient.id, ingredient);
  }
  return map;
}

function loadAllRecettes(ingredientsMap: Map<string, IngredientOutput>): Recette[] {
  const dir = join(DATA_ROOT, 'recettes');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((file) => {
      const recetteInput = RecetteInputSchema.parse(
        parseYaml(readFileSync(join(dir, file), 'utf-8')),
      );
      const { allergenes_calcules } = computeRecipeMetadata(recetteInput, ingredientsMap);
      const { exclusions_compatibles } = computeDietaryMetadata(recetteInput, ingredientsMap);
      return { ...recetteInput, allergenes_calcules, exclusions_compatibles } as Recette;
    });
}

// ─── Profils de référence ─────────────────────────────────────────────────────

const ALL_EQUIPMENT: Equipment[] = ['four', 'plaque', 'micro-ondes', 'barbecue', 'blender', 'robot'];

interface Profile {
  id: string;
  description: string;
  nbJours: number;
  allergenes_groupe: Allergen[];
  equipement_disponible: Equipment[];
  exclusions_groupe: ExclusionTag[];
}

const PROFILES: Profile[] = [
  {
    id: 'vide',
    description: 'Aucune contrainte',
    nbJours: 7,
    allergenes_groupe: [],
    equipement_disponible: ALL_EQUIPMENT,
    exclusions_groupe: [],
  },
  {
    id: 'sarah',
    description: 'Cœliaque + végétarien, 6 couverts, 7 jours',
    nbJours: 7,
    allergenes_groupe: ['gluten'],
    equipement_disponible: ALL_EQUIPMENT,
    exclusions_groupe: ['vegetarien'],
  },
  {
    id: 'saturant',
    description: 'EU14 complet + équipement vide',
    nbJours: 7,
    allergenes_groupe: [...EU14_ALLERGENS],
    equipement_disponible: [],
    exclusions_groupe: [],
  },
];

// ─── Logique de diagnostic ─────────────────────────────────────────────────────

interface ProfileResult {
  id: string;
  description: string;
  counts: Record<MealType, number>;
  verdict: string;
}

// Profondeur minimale dérivée de la règle cohérence (pas réimplémentée ici).
// Petit-déjeuner est exempté de la fenêtre glissante (ADR-009 / TK-39).
function minDepthForSlot(slot: MealType): number {
  return slot === 'petit-dejeuner' ? 1 : RECETTE_DUPLIQUEE_WINDOW_DAYS;
}

function diagnose(catalogue: Recette[], profile: Profile): ProfileResult {
  const afterAllergens = filterRecipes(catalogue, {
    allergenes_groupe: profile.allergenes_groupe,
    equipement_disponible: profile.equipement_disponible,
  });
  const pool = filterByExclusions(afterAllergens, {
    exclusions_groupe: profile.exclusions_groupe,
  });

  const counts: Record<MealType, number> = {
    'petit-dejeuner': pool.filter((r) => r.type_repas.includes('petit-dejeuner')).length,
    'midi': pool.filter((r) => r.type_repas.includes('midi')).length,
    'soir': pool.filter((r) => r.type_repas.includes('soir')).length,
  };

  const failures: string[] = (['petit-dejeuner', 'midi', 'soir'] as MealType[])
    .filter((slot) => counts[slot] < minDepthForSlot(slot))
    .map((slot) => `${slot}, ${counts[slot]} distinctes`);

  const verdict =
    failures.length === 0 ? 'tient' : `profondeur insuffisante: ${failures.join('; ')}`;

  return { id: profile.id, description: profile.description, counts, verdict };
}

// ─── Suite de test ────────────────────────────────────────────────────────────

describe('TK-40a — couverture catalogue par profil', () => {
  let results: Map<string, ProfileResult>;

  beforeAll(() => {
    const ingredientsMap = loadAllIngredients();
    const catalogue = loadAllRecettes(ingredientsMap);

    results = new Map(PROFILES.map((p) => [p.id, diagnose(catalogue, p)]));

    // Artefact déterministe — contenu stable entre deux runs sur le même catalogue
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      join(REPORTS_DIR, 'catalogue-coverage.json'),
      JSON.stringify(
        {
          coherence_window: RECETTE_DUPLIQUEE_WINDOW_DAYS,
          min_depth_rules: {
            'petit-dejeuner': 1,
            midi: RECETTE_DUPLIQUEE_WINDOW_DAYS,
            soir: RECETTE_DUPLIQUEE_WINDOW_DAYS,
          },
          profiles: [...results.values()],
        },
        null,
        2,
      ),
      'utf-8',
    );

    // Table console pour lecture rapide
    console.table(
      [...results.values()].map((r) => ({
        profil: r.id,
        'petit-dej': r.counts['petit-dejeuner'],
        midi: r.counts['midi'],
        soir: r.counts['soir'],
        verdict: r.verdict,
      })),
    );
  });

  it('tous les verdicts ont la forme attendue', () => {
    for (const result of results.values()) {
      expect(result.verdict, `profil ${result.id}`).toMatch(
        /^(tient|profondeur insuffisante: .+)$/,
      );
    }
  });

  it("profil vide → tient (sanity : le catalogue n'est pas vide)", () => {
    expect(results.get('vide')!.verdict).toBe('tient');
  });

  it('profil saturant → profondeur insuffisante (pool EU14 + équipement vide)', () => {
    const saturant = results.get('saturant')!;
    expect(saturant.verdict).not.toBe('tient');
    expect(saturant.verdict).toMatch(/^profondeur insuffisante:/);
  });

  it('profil sarah → forme valide (résultat mesuré, pas de valeur attendue)', () => {
    const sarah = results.get('sarah')!;
    expect(sarah.verdict).toMatch(/^(tient|profondeur insuffisante: .+)$/);
  });
});
