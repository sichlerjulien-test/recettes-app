/**
 * scripts/build-data.ts
 *
 * Pousse les données YAML de data/ vers Supabase.
 * Idempotent : peut être relancé sans perdre de données.
 *
 * Usage :
 *   npm run build-data
 *   ou : npx tsx scripts/build-data.ts
 */

import dotenv from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createClient } from '@supabase/supabase-js';

import { IngredientSchema, RecetteInputSchema } from '../src/lib/types/schemas';
import type { IngredientOutput, RecetteOutput } from '../src/lib/types/schemas';
import { computeRecipeMetadata } from '../src/lib/allergens/compute';

// ---------------------------------------------------------------------------
// ENV
// ---------------------------------------------------------------------------

dotenv.config({ path: '.env.local' });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Erreur : variable d'env manquante — ${name}`);
    console.error('Vérifiez votre .env.local (voir .env.example).');
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

// ---------------------------------------------------------------------------
// DB ROW TYPES
// ---------------------------------------------------------------------------

type IngredientRow = {
  id: string;
  nom_singulier: string;
  nom_pluriel: string;
  categorie: string;
  unite_base: string;
  unite_achat: string;
  conversion: number;
  allergenes: string[];
  contient_trace: string[];
  substituts: string[];
  saisonnalite: number[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RecetteRow = {
  id: string;
  nom: string;
  description: string;
  portions_base: number;
  duree_minutes: number;
  duree_active: number;
  difficulte: string;
  equipement: string[];
  type_repas: string[];
  type_cuisine: string;
  saison: string[];
  ingredient_principal: string;
  feculent_dominant: string;
  etapes: string[];
  tags_libres: string[];
  allergenes_calcules: string[];
  est_vegetarien: boolean;
  est_vegan: boolean;
  created_at: string;
  updated_at: string;
};

type RecetteIngredientRow = {
  recette_id: string;
  ingredient_id: string;
  quantite_base: number;
  unite: string;
  optionnel: boolean;
  groupe: string | null;
  position: number;
};

type IngredientInsert = Omit<IngredientRow, 'created_at' | 'updated_at'>;
type RecetteInsert = Omit<RecetteRow, 'created_at' | 'updated_at'>;

type Database = {
  public: {
    Tables: {
      ingredients: {
        Row: IngredientRow;
        Insert: IngredientInsert;
        Update: Partial<IngredientInsert>;
        Relationships: [];
      };
      recettes: {
        Row: RecetteRow;
        Insert: RecetteInsert;
        Update: Partial<RecetteInsert>;
        Relationships: [];
      };
      recette_ingredients: {
        Row: RecetteIngredientRow;
        Insert: RecetteIngredientRow;
        Update: Partial<RecetteIngredientRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// SUPABASE CLIENT
// ---------------------------------------------------------------------------

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), 'data');
const INGREDIENTS_DIR = join(DATA_DIR, 'ingredients');
const RECETTES_DIR = join(DATA_DIR, 'recettes');

// ---------------------------------------------------------------------------
// CHARGEMENT YAML (pattern identique à scripts/validate.ts)
// ---------------------------------------------------------------------------

async function loadYamlFiles<T>(
  dir: string,
  schema: { parse: (data: unknown) => T },
): Promise<{ items: Map<string, T>; errors: string[] }> {
  const items = new Map<string, T>();
  const errors: string[] = [];
  let files: string[];

  try {
    files = await readdir(dir);
  } catch (err) {
    errors.push(`Impossible de lire ${dir} : ${(err as Error).message}`);
    return { items, errors };
  }

  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of yamlFiles) {
    const fullPath = join(dir, file);
    let raw: string;
    try {
      raw = await readFile(fullPath, 'utf-8');
    } catch (err) {
      errors.push(`[${file}] Lecture impossible : ${(err as Error).message}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      errors.push(`[${file}] YAML invalide : ${(err as Error).message}`);
      continue;
    }

    try {
      const validated = schema.parse(parsed);
      const id = (validated as { id: string }).id;

      if (items.has(id)) {
        errors.push(`[${file}] ID en double : "${id}" déjà défini`);
      } else {
        items.set(id, validated);
      }
    } catch (err) {
      errors.push(`[${file}] Schéma invalide : ${(err as Error).message}`);
    }
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// RAPPORT
// ---------------------------------------------------------------------------

function printReport(
  ingredientsCount: number,
  recettesCount: number,
  riCount: number,
  errors: string[],
): void {
  const sep = '─'.repeat(60);
  console.log('\n' + sep);
  console.log(' RAPPORT BUILD-DATA');
  console.log(sep);
  console.log(` Ingrédients chargés      : ${ingredientsCount}`);
  console.log(` Recettes chargées        : ${recettesCount}`);
  console.log(` recette_ingredients liés : ${riCount}`);
  console.log(` Erreurs                  : ${errors.length}`);
  console.log(sep);

  if (errors.length > 0) {
    console.log('\n  Erreurs :');
    for (const e of errors) {
      console.log(`  • ${e}`);
    }
    console.log('\n  Build ÉCHOUÉ\n');
  } else {
    console.log('\n  Build RÉUSSI\n');
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const buildErrors: string[] = [];

  // 1. Chargement des YAML
  console.log('Chargement des ingrédients YAML…');
  const { items: ingredients, errors: ingredientLoadErrors } =
    await loadYamlFiles<IngredientOutput>(INGREDIENTS_DIR, IngredientSchema);
  buildErrors.push(...ingredientLoadErrors);

  console.log('Chargement des recettes YAML…');
  const { items: recettes, errors: recetteLoadErrors } =
    await loadYamlFiles<RecetteOutput>(RECETTES_DIR, RecetteInputSchema);
  buildErrors.push(...recetteLoadErrors);

  if (buildErrors.length > 0) {
    printReport(0, 0, 0, buildErrors);
    process.exit(1);
  }

  // 2. Upsert ingrédients
  console.log(`Upsert de ${ingredients.size} ingrédient(s)…`);

  const ingredientRows: IngredientInsert[] = [];
  for (const ingredient of ingredients.values()) {
    ingredientRows.push({
      id: ingredient.id,
      nom_singulier: ingredient.nom_singulier,
      nom_pluriel: ingredient.nom_pluriel,
      categorie: ingredient.categorie,
      unite_base: ingredient.unite_base,
      unite_achat: ingredient.unite_achat,
      conversion: ingredient.conversion,
      allergenes: [...ingredient.allergenes],
      contient_trace: [...ingredient.contient_trace],
      substituts: [...ingredient.substituts],
      saisonnalite: ingredient.saisonnalite !== undefined ? [...ingredient.saisonnalite] : null,
      notes: ingredient.notes !== undefined ? ingredient.notes : null,
    });
  }

  if (ingredientRows.length > 0) {
    const { error: ingredientUpsertError } = await supabase
      .from('ingredients')
      .upsert(ingredientRows, { onConflict: 'id' });

    if (ingredientUpsertError) {
      buildErrors.push(`Upsert ingredients : ${ingredientUpsertError.message}`);
      printReport(0, 0, 0, buildErrors);
      process.exit(1);
    }
  }

  // 3. Calcul des métadonnées + upsert recettes
  console.log(`Calcul des métadonnées et upsert de ${recettes.size} recette(s)…`);

  // IngredientOutput est structurellement identique à Ingredient (même z.infer<typeof IngredientSchema>)
  const ingredientsMap = new Map(ingredients);
  const recetteRows: RecetteInsert[] = [];

  for (const recette of recettes.values()) {
    let meta: { allergenes_calcules: string[]; est_vegetarien: boolean; est_vegan: boolean };
    try {
      meta = computeRecipeMetadata(recette, ingredientsMap);
    } catch (err) {
      buildErrors.push(`[${recette.id}] Calcul métadonnées : ${(err as Error).message}`);
      continue;
    }

    recetteRows.push({
      id: recette.id,
      nom: recette.nom,
      description: recette.description,
      portions_base: recette.portions_base,
      duree_minutes: recette.duree_minutes,
      duree_active: recette.duree_active,
      difficulte: recette.difficulte,
      equipement: [...recette.equipement],
      type_repas: [...recette.type_repas],
      type_cuisine: recette.type_cuisine,
      saison: [...recette.saison],
      ingredient_principal: recette.ingredient_principal,
      feculent_dominant: recette.feculent_dominant,
      etapes: [...recette.etapes],
      tags_libres: [...recette.tags_libres],
      allergenes_calcules: [...meta.allergenes_calcules],
      est_vegetarien: meta.est_vegetarien,
      est_vegan: meta.est_vegan,
    });
  }

  if (recetteRows.length > 0) {
    const { error: recetteUpsertError } = await supabase
      .from('recettes')
      .upsert(recetteRows, { onConflict: 'id' });

    if (recetteUpsertError) {
      buildErrors.push(`Upsert recettes : ${recetteUpsertError.message}`);
      printReport(0, 0, 0, buildErrors);
      process.exit(1);
    }
  }

  // 4. Delete + Insert recette_ingredients
  // Note : DELETE + INSERT non transactionnel. Si l'INSERT échoue après
  // le DELETE, la recette se retrouve sans ingrédients jusqu'au prochain
  // build-data. Acceptable au MVP (10 recettes, idempotent à condition
  // d'aller au bout). Si le bug se manifeste, relancer le script.
  // À durcir si nécessaire via une RPC Supabase transactionnelle.
  console.log('Mise à jour des recette_ingredients…');

  const processedIds = new Set<string>(recetteRows.map((r) => r.id));
  let totalRi = 0;

  for (const recette of recettes.values()) {
    if (!processedIds.has(recette.id)) continue;

    const { error: deleteError } = await supabase
      .from('recette_ingredients')
      .delete()
      .eq('recette_id', recette.id);

    if (deleteError) {
      buildErrors.push(
        `[${recette.id}] Suppression recette_ingredients : ${deleteError.message}`,
      );
      continue;
    }

    const riRows: RecetteIngredientRow[] = recette.ingredients.map((ri, index) => ({
      recette_id: recette.id,
      ingredient_id: ri.ingredient_id,
      quantite_base: ri.quantite_base,
      unite: ri.unite,
      optionnel: ri.optionnel,
      groupe: ri.groupe !== undefined ? ri.groupe : null,
      position: index,
    }));

    if (riRows.length === 0) continue;

    const { error: insertError } = await supabase
      .from('recette_ingredients')
      .insert(riRows);

    if (insertError) {
      buildErrors.push(
        `[${recette.id}] Insertion recette_ingredients : ${insertError.message}`,
      );
      continue;
    }

    totalRi += riRows.length;
  }

  printReport(ingredients.size, recetteRows.length, totalRi, buildErrors);
  process.exit(buildErrors.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('Erreur fatale :', err);
  process.exit(2);
});
