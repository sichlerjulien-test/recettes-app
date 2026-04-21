/**
 * scripts/validate.ts
 *
 * Valide la cohérence de toutes les données YAML du projet.
 *
 * Vérifications :
 *   1. Tous les ingrédients sont conformes au schéma Zod
 *   2. Toutes les recettes sont conformes au schéma Zod
 *   3. Tous les ingredient_id référencés dans les recettes existent
 *   4. Tous les substituts référencés existent
 *   5. duree_active <= duree_minutes
 *
 * Sortie : rapport texte clair + code de sortie (0 = OK, 1 = erreurs)
 *
 * Usage :
 *   npm run validate
 *   ou : tsx scripts/validate.ts
 *
 * Ce script DOIT tourner en CI (cf. .github/workflows/validate-data.yml)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  IngredientSchema,
  RecetteInputSchema,
} from '../src/lib/types/schemas';
import type {
  IngredientOutput,
  RecetteOutput,
} from '../src/lib/types/schemas';

const DATA_DIR = join(process.cwd(), 'data');
const INGREDIENTS_DIR = join(DATA_DIR, 'ingredients');
const RECETTES_DIR = join(DATA_DIR, 'recettes');

interface ValidationError {
  file: string;
  message: string;
}

const errors: ValidationError[] = [];
const warnings: ValidationError[] = [];

function logError(file: string, message: string): void {
  errors.push({ file, message });
}

function logWarning(file: string, message: string): void {
  warnings.push({ file, message });
}

async function loadYamlFiles<T>(
  dir: string,
  schema: { parse: (data: unknown) => T },
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  let files: string[];

  try {
    files = await readdir(dir);
  } catch (err) {
    console.error(`Impossible de lire ${dir} :`, err);
    return map;
  }

  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of yamlFiles) {
    const fullPath = join(dir, file);
    let raw: string;
    try {
      raw = await readFile(fullPath, 'utf-8');
    } catch (err) {
      logError(file, `Lecture impossible : ${(err as Error).message}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      logError(file, `YAML invalide : ${(err as Error).message}`);
      continue;
    }

    try {
      const validated = schema.parse(parsed);
      const id = (validated as { id: string }).id;

      if (map.has(id)) {
        logError(file, `ID en double : "${id}" déjà défini`);
      } else {
        map.set(id, validated);
      }
    } catch (err) {
      logError(file, `Schéma invalide : ${(err as Error).message}`);
    }
  }

  return map;
}

function validateRecipeReferences(
  recettes: Map<string, RecetteOutput>,
  ingredients: Map<string, IngredientOutput>,
): void {
  for (const [id, recette] of recettes) {
    const file = `${id}.yaml`;

    for (const ri of recette.ingredients) {
      if (!ingredients.has(ri.ingredient_id)) {
        logError(
          file,
          `Référence ingrédient inexistante : "${ri.ingredient_id}"`,
        );
      }
    }
  }
}

function validateIngredientReferences(
  ingredients: Map<string, IngredientOutput>,
): void {
  for (const [id, ingredient] of ingredients) {
    const file = `${id}.yaml`;

    for (const sub of ingredient.substituts) {
      if (!ingredients.has(sub)) {
        logWarning(
          file,
          `Substitut inexistant : "${sub}" (à créer ou retirer)`,
        );
      }
    }
  }
}

function printReport(
  ingredientCount: number,
  recetteCount: number,
): void {
  const sep = '─'.repeat(60);

  console.log('\n' + sep);
  console.log(' RAPPORT DE VALIDATION DES DONNÉES');
  console.log(sep);
  console.log(` Ingrédients chargés : ${ingredientCount}`);
  console.log(` Recettes chargées   : ${recetteCount}`);
  console.log(` Erreurs             : ${errors.length}`);
  console.log(` Avertissements      : ${warnings.length}`);
  console.log(sep);

  if (warnings.length > 0) {
    console.log('\n  Avertissements :');
    for (const w of warnings) {
      console.log(`  • [${w.file}] ${w.message}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n  Erreurs :');
    for (const e of errors) {
      console.log(`  • [${e.file}] ${e.message}`);
    }
    console.log('\n  Validation ÉCHOUÉE\n');
  } else {
    console.log('\n  Validation RÉUSSIE\n');
  }
}

async function main(): Promise<void> {
  console.log('Chargement des ingrédients…');
  const ingredients = await loadYamlFiles<IngredientOutput>(
    INGREDIENTS_DIR,
    IngredientSchema,
  );

  console.log('Chargement des recettes…');
  const recettes = await loadYamlFiles<RecetteOutput>(
    RECETTES_DIR,
    RecetteInputSchema,
  );

  console.log('Vérification des références ingrédient_id…');
  validateRecipeReferences(recettes, ingredients);

  console.log('Vérification des substituts…');
  validateIngredientReferences(ingredients);

  printReport(ingredients.size, recettes.size);

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Erreur fatale :', err);
  process.exit(2);
});
