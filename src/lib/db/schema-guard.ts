import 'server-only';
import { getSupabaseClient } from './supabase';
import { READ_CONTRACT } from './read-contract';
import type { DbError } from '../types/domain';

type SchemaGuardResult =
  | { ok: true }
  | { ok: false; error: DbError };

// Mémoïsation module-scope du promise — 1 passe par instance chaude.
// Les appels concurrents partagent le même promise sans race.
let memoizedPromise: Promise<SchemaGuardResult> | null = null;

function extractColumn(message: string): string {
  const m = message.match(/column "([^"]+)" does not exist/);
  return m?.[1] ?? message;
}

async function runSchemaCheck(): Promise<SchemaGuardResult> {
  const supabase = getSupabaseClient();
  const missing: { table: string; column: string }[] = [];

  for (const [table, cols] of Object.entries(READ_CONTRACT)) {
    const { error } = await supabase
      .from(table as 'recettes')
      .select(cols.join(','))
      .limit(1);

    if (error && (error as { code?: string }).code === '42703') {
      missing.push({ table, column: extractColumn(error.message) });
    }
  }

  if (missing.length > 0) {
    return { ok: false, error: { kind: 'schema_drift', missing } };
  }
  return { ok: true };
}

export function assertSchema(): Promise<SchemaGuardResult> {
  if (!memoizedPromise) {
    memoizedPromise = runSchemaCheck();
  }
  return memoizedPromise;
}

export function _resetSchemaGuardForTests(): void {
  memoizedPromise = null;
}
