import { describe, expect, it } from 'vitest';
import { validateIngredientExclusionCompleteness } from '../scripts/ingredient-exclusion-completeness';
import { IngredientSchema, type IngredientOutput } from '../src/lib/types/schemas';

function ingredient(
  overrides: Partial<IngredientOutput> & Pick<IngredientOutput, 'id'>,
): IngredientOutput {
  return IngredientSchema.parse({
    id: overrides.id,
    nom_singulier: overrides.nom_singulier ?? overrides.id,
    nom_pluriel: overrides.nom_pluriel ?? overrides.id,
    categorie: overrides.categorie ?? 'condiments-epices',
    unite_base: overrides.unite_base ?? 'g',
    unite_achat: overrides.unite_achat ?? 'g',
    conversion: overrides.conversion ?? 1,
    allergenes: overrides.allergenes ?? [],
    contient_trace: overrides.contient_trace ?? [],
    substituts: overrides.substituts ?? [],
    exclusion_tags: overrides.exclusion_tags ?? [],
    saisonnalite: overrides.saisonnalite,
    notes: overrides.notes,
  });
}

// ─── Régime 1 : allergène → tag (inchangé) ───────────────────────────────────

describe('validateIngredientExclusionCompleteness — Régime 1', () => {
  it('échoue pour un allergène poisson sans tag, même hors viandes-poissons', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['nuoc-mam', ingredient({ id: 'nuoc-mam', allergenes: ['poissons'] })],
    ]));

    expect(errors).toStrictEqual([
      '[nuoc-mam.yaml] allergène "poissons" exige exclusion_tags: "sans-poisson"',
    ]);
  });

  it('échoue pour crustacés et mollusques sans sans-fruits-de-mer', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['crevettes', ingredient({ id: 'crevettes', allergenes: ['crustaces'] })],
      ['moules', ingredient({ id: 'moules', allergenes: ['mollusques'] })],
    ]));

    expect(errors).toStrictEqual([
      '[crevettes.yaml] allergène "crustaces" exige exclusion_tags: "sans-fruits-de-mer"',
      '[moules.yaml] allergène "mollusques" exige exclusion_tags: "sans-fruits-de-mer"',
    ]);
  });

  it('accepte les ingrédients correctement tagués (Régime 1)', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['saumon-frais', ingredient({
        id: 'saumon-frais',
        categorie: 'viandes-poissons',
        allergenes: ['poissons'],
        exclusion_tags: ['sans-poisson'],
      })],
      ['moules-bouchot', ingredient({
        id: 'moules-bouchot',
        categorie: 'viandes-poissons',
        allergenes: ['mollusques'],
        exclusion_tags: ['sans-fruits-de-mer'],
      })],
    ]));

    expect(errors).toStrictEqual([]);
  });
});

// ─── Régime 2 : triage porc ───────────────────────────────────────────────────

describe('validateIngredientExclusionCompleteness — Régime 2 porc', () => {
  it('échoue si lardon-fume (triage porc) manque sans-porc', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['lardon-fume', ingredient({ id: 'lardon-fume', categorie: 'viandes-poissons' })],
    ]));

    expect(errors).toContain('[lardon-fume.yaml] triage porc : exige exclusion_tags: "sans-porc"');
  });

  it('accepte lardon-fume avec sans-porc', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['lardon-fume', ingredient({ id: 'lardon-fume', categorie: 'viandes-poissons', exclusion_tags: ['sans-porc'] })],
    ]));

    const porcErrors = errors.filter((e) => e.includes('triage porc'));
    expect(porcErrors).toHaveLength(0);
  });
});

// ─── Régime 2 : triage alcool ─────────────────────────────────────────────────

describe('validateIngredientExclusionCompleteness — Régime 2 alcool', () => {
  it('échoue si biere-blonde (triage alcool) manque sans-alcool', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['biere-blonde', ingredient({ id: 'biere-blonde', categorie: 'epicerie-salee' })],
    ]));

    expect(errors).toContain('[biere-blonde.yaml] triage alcool : exige exclusion_tags: "sans-alcool"');
  });

  it('accepte biere-blonde avec sans-alcool', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['biere-blonde', ingredient({ id: 'biere-blonde', categorie: 'epicerie-salee', exclusion_tags: ['sans-alcool'] })],
    ]));

    const alcoolErrors = errors.filter((e) => e.includes('triage alcool'));
    expect(alcoolErrors).toHaveLength(0);
  });
});

// ─── Régime 2 : triage viande-rouge ──────────────────────────────────────────

describe('validateIngredientExclusionCompleteness — Régime 2 viande-rouge', () => {
  it('échoue si boeuf-hache (triage viande-rouge) manque sans-viande-rouge', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['boeuf-hache', ingredient({ id: 'boeuf-hache', categorie: 'viandes-poissons' })],
    ]));

    expect(errors).toContain('[boeuf-hache.yaml] triage viande-rouge : exige exclusion_tags: "sans-viande-rouge"');
  });
});

// ─── Invariant croisé tag→catégorie ──────────────────────────────────────────

describe('validateIngredientExclusionCompleteness — invariant tag→catégorie', () => {
  it('échoue si sans-porc est posé hors viandes-poissons (cas jambon-frais-traiteur)', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['jambon-frais', ingredient({
        id: 'jambon-frais',
        categorie: 'frais-traiteur',
        exclusion_tags: ['sans-porc'],
      })],
    ]));

    expect(errors).toContain(
      '[jambon-frais.yaml] tag "sans-porc" exige categorie "viandes-poissons" (catégorie trouvée : "frais-traiteur")',
    );
  });

  it('ne se déclenche PAS sur sans-alcool hors viandes-poissons (bière, vin)', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['biere-blonde', ingredient({
        id: 'biere-blonde',
        categorie: 'epicerie-salee',
        exclusion_tags: ['sans-alcool'],
      })],
    ]));

    const invariantErrors = errors.filter((e) => e.includes('exige categorie "viandes-poissons"'));
    expect(invariantErrors).toHaveLength(0);
  });

  it('accepte un ingrédient animal correctement classé en viandes-poissons', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['jambon-blanc', ingredient({
        id: 'jambon-blanc',
        categorie: 'viandes-poissons',
        exclusion_tags: ['sans-porc'],
      })],
    ]));

    const invariantErrors = errors.filter((e) => e.includes('exige categorie "viandes-poissons"'));
    expect(invariantErrors).toHaveLength(0);
  });
});

// ─── Régime 2 : couverture catégories susceptibles ───────────────────────────

describe('validateIngredientExclusionCompleteness — couverture catégories', () => {
  it('échoue pour un ingrédient viandes-poissons absent de TRIAGE_COVERED', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['nouveau-charcuterie', ingredient({ id: 'nouveau-charcuterie', categorie: 'viandes-poissons' })],
    ]));

    expect(errors).toContain(
      '[nouveau-charcuterie.yaml] catégorie "viandes-poissons" susceptible — ajoutez cet ingrédient à TRIAGE_COVERED dans scripts/ingredient-exclusion-completeness.ts',
    );
  });

  it('échoue pour un ingrédient frais-traiteur absent de TRIAGE_COVERED', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['nouveau-traiteur', ingredient({ id: 'nouveau-traiteur', categorie: 'frais-traiteur' })],
    ]));

    expect(errors).toContain(
      '[nouveau-traiteur.yaml] catégorie "frais-traiteur" susceptible — ajoutez cet ingrédient à TRIAGE_COVERED dans scripts/ingredient-exclusion-completeness.ts',
    );
  });

  it('accepte lardon-fume (dans TRIAGE_COVERED) sans erreur de couverture', () => {
    const errors = validateIngredientExclusionCompleteness(new Map([
      ['lardon-fume', ingredient({ id: 'lardon-fume', categorie: 'viandes-poissons', exclusion_tags: ['sans-porc'] })],
    ]));

    const coverageErrors = errors.filter((e) => e.includes('susceptible'));
    expect(coverageErrors).toHaveLength(0);
  });
});
