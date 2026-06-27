import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
  _resetSupabaseClientForTests: vi.fn(),
}));
vi.mock('./schema-guard', () => ({
  assertSchema: vi.fn().mockResolvedValue({ ok: true }),
  _resetSchemaGuardForTests: vi.fn(),
}));

import { getSupabaseClient } from './supabase';
import { assertSchema } from './schema-guard';
import { getAllRecettes, getRecetteById, getAllRecettesAsMap } from './recettes';

// ─── Mock Supabase chainable builder ─────────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

function makeChain(result: Promise<MockResult>) {
  return {
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
    select: (_cols?: string) => makeChain(result),
    eq: (_col: string, _val: unknown) => makeChain(result),
    insert: (_rows: unknown) => makeChain(result),
    single: () => result,
    maybeSingle: () => result,
  };
}

function createMockSupabase(tableQueues: Record<string, MockResult[]>): ReturnType<typeof getSupabaseClient> {
  // cast nécessaire : mock partiel — seule from est implémentée, pas l'interface complète
  return {
    from: (table: string) => {
      const queue = tableQueues[table] ?? [];
      const next = queue.shift() ?? { data: null, error: null };
      return makeChain(Promise.resolve(next));
    },
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAW_RECETTE_ROW = {
  id: 'salade-tomate-basilic',
  nom: 'Salade tomate basilic',
  description: 'Salade fraîche de saison.',
  portions_base: 4,
  duree_minutes: 10,
  duree_active: 10,
  difficulte: 'facile',
  equipement: ['plaque'],
  type_repas: ['midi', 'soir'],
  type_cuisine: 'mediterraneenne',
  saison: ['ete'],
  ingredient_principal: 'legumes',
  feculent_dominant: 'aucun',
  etapes: ['Couper les légumes.', 'Assaisonner.'],
  tags_libres: ['rapide', 'vegan'],
  allergenes_calcules: [],
  est_vegetarien: true,
  est_vegan: true,
  exclusions_compatibles: [
    'sans-viande-rouge', 'sans-porc', 'sans-poisson', 'sans-fruits-de-mer', 'sans-alcool',
    'vegetarien', 'vegan',
  ],
  recette_ingredients: [
    { ingredient_id: 'tomate', quantite_base: 600, unite: 'g', optionnel: false, groupe: null, position: 1 },
    { ingredient_id: 'oignon', quantite_base: 100, unite: 'g', optionnel: false, groupe: null, position: 2 },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('recettes DAL', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertSchema).mockResolvedValue({ ok: true });
  });

  describe('getAllRecettes', () => {
    it('should return ok with parsed recettes when DB returns valid rows', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          recettes: [{ data: [RAW_RECETTE_ROW], error: null }],
        }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.recettes).toHaveLength(1);
        expect(result.recettes[0]?.id).toBe('salade-tomate-basilic');
        expect(result.recettes[0]?.nom).toBe('Salade tomate basilic');
      }
    });

    it('should return query_failed when DB errors', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          recettes: [{ data: null, error: { message: 'connection refused' } }],
        }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('query_failed');
        if (result.error.kind === 'query_failed') {
          expect(result.error.cause).toBe('connection refused');
        }
      }
    });

    it('should return row_validation_failed when row shape is invalid (unknown difficulte)', async () => {
      const invalidRow = { ...RAW_RECETTE_ROW, difficulte: 'expert' };

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          recettes: [{ data: [invalidRow], error: null }],
        }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });
  });

  describe('getRecetteById', () => {
    it('should return not_found when row is null', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          recettes: [{ data: null, error: null }],
        }),
      );

      const result = await getRecetteById('unknown-slug');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('not_found');
        if (result.error.kind === 'not_found') {
          expect(result.error.entity).toBe('recette');
          expect(result.error.id).toBe('unknown-slug');
        }
      }
    });
  });

  describe('getAllRecettesAsMap', () => {
    it('should convert the recettes array to a Map keyed by id', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({
          recettes: [{ data: [RAW_RECETTE_ROW], error: null }],
        }),
      );

      const result = await getAllRecettesAsMap();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.recettes).toBeInstanceOf(Map);
        expect(result.recettes.size).toBe(1);
        expect(result.recettes.has('salade-tomate-basilic')).toBe(true);
        expect(result.recettes.get('salade-tomate-basilic')?.nom).toBe('Salade tomate basilic');
      }
    });
  });

  // ─── Régression P0 : lecture verbatim de exclusions_compatibles ──────────────
  // Avant le fix, mapRecetteRow reconstruisait exclusions_compatibles depuis
  // est_vegetarien/est_vegan uniquement → les 5 tags atomiques étaient perdus.
  // Sélectionner 'sans-porc' seul vidait le pool à tort.

  describe('exclusions_compatibles — lecture verbatim depuis la colonne DB', () => {
    it('lit les 7 tags depuis la colonne DB, pas seulement vegetarien/vegan', async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({ recettes: [{ data: [RAW_RECETTE_ROW], error: null }] }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const recette = result.recettes[0]!;
        expect(recette.exclusions_compatibles).toContain('sans-porc');
        expect(recette.exclusions_compatibles).toContain('sans-viande-rouge');
        expect(recette.exclusions_compatibles).toContain('sans-poisson');
        expect(recette.exclusions_compatibles).toContain('sans-fruits-de-mer');
        expect(recette.exclusions_compatibles).toContain('sans-alcool');
        expect(recette.exclusions_compatibles).toContain('vegetarien');
        expect(recette.exclusions_compatibles).toContain('vegan');
      }
    });

    it("sans-porc seul : pool avec recette compatible n'est pas vide (régression P0)", async () => {
      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({ recettes: [{ data: [RAW_RECETTE_ROW], error: null }] }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const pool = result.recettes.filter((r) => r.exclusions_compatibles.includes('sans-porc'));
        expect(pool.length, 'le pool sans-porc ne doit pas être vide').toBeGreaterThan(0);
      }
    });

    it('row avec est_vegan=true mais exclusions_compatibles=[vegetarien,vegan] ne contient pas les tags atomiques', async () => {
      // Ce test documente le bug P0 résolu : l'ancienne reconstruction depuis les
      // booléens produisait seulement ['vegetarien', 'vegan'], sans les tags atomiques.
      // Désormais, seule la colonne DB fait foi.
      const rowSansTags = {
        ...RAW_RECETTE_ROW,
        exclusions_compatibles: ['vegetarien', 'vegan'],
      };

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({ recettes: [{ data: [rowSansTags], error: null }] }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const recette = result.recettes[0]!;
        // La valeur vient de la colonne DB, pas reconstruite depuis les booléens.
        expect(recette.exclusions_compatibles).not.toContain('sans-porc');
        expect(recette.exclusions_compatibles).not.toContain('sans-alcool');
        expect(recette.exclusions_compatibles).toContain('vegetarien');
        expect(recette.exclusions_compatibles).toContain('vegan');
      }
    });
  });

  // ─── Régression TK-16 : throw row-level converti en Result ──────────────────
  // requireExclusionsCompatibles lève une erreur si exclusions_compatibles est null.
  // Le DAL doit attraper ce throw et retourner row_validation_failed, jamais laisser
  // l'erreur remonter au niveau route.

  describe('exclusions_compatibles = null → row_validation_failed (pas un throw)', () => {
    it('getAllRecettes retourne row_validation_failed quand exclusions_compatibles est null', async () => {
      const rowNullExclusions = { ...RAW_RECETTE_ROW, exclusions_compatibles: null };

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({ recettes: [{ data: [rowNullExclusions], error: null }] }),
      );

      const result = await getAllRecettes();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });

    it('getRecetteById retourne row_validation_failed quand exclusions_compatibles est null', async () => {
      const rowNullExclusions = { ...RAW_RECETTE_ROW, exclusions_compatibles: null };

      vi.mocked(getSupabaseClient).mockReturnValue(
        createMockSupabase({ recettes: [{ data: rowNullExclusions, error: null }] }),
      );

      const result = await getRecetteById('salade-tomate-basilic');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('row_validation_failed');
      }
    });
  });
});
