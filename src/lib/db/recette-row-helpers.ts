/**
 * Utilitaires purs de mapping ligne DB → domaine.
 * Sans import 'server-only' : testables en isolation par Vitest.
 */

/**
 * Extrait et valide exclusions_compatibles depuis une ligne brute Supabase.
 *
 * NULL signifie "non-matérialisé" (migration 009 appliquée, build-data pas encore
 * tourné) : lève une erreur bruyante pour éviter un faux pool_empty silencieux.
 * Une valeur [] est légitime (recette compatible avec aucune exclusion).
 */
export function requireExclusionsCompatibles(ec: unknown, recetteId: unknown): unknown[] {
  if (ec === null || ec === undefined) {
    throw new Error(
      `exclusions_compatibles non matérialisé pour recette ${String(recetteId)} — lancer npm run build-data`,
    );
  }
  return Array.isArray(ec) ? ec : [];
}
