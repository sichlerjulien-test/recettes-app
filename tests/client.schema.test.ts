import { describe, it, expect } from 'vitest';
import { buildComposePlanningToolInputSchema } from '@/lib/llm/client';
import { MealTypeSchema } from '@/lib/types/schemas';

describe('buildComposePlanningToolInputSchema', () => {
  const schema = buildComposePlanningToolInputSchema();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any;

  it('dérive l\'enum repas depuis MealTypeSchema.options (source unique)', () => {
    expect(s.properties.planning.items.properties.repas.enum).toEqual(MealTypeSchema.options);
  });

  it('additionalProperties:false au niveau racine', () => {
    expect(s.additionalProperties).toBe(false);
  });

  it('additionalProperties:false au niveau des items du planning', () => {
    expect(s.properties.planning.items.additionalProperties).toBe(false);
  });

  it('n\'inclut pas de clé $schema', () => {
    expect(schema).not.toHaveProperty('$schema');
  });

  it('n\'inclut pas de $ref ni de $defs (tout inliné)', () => {
    const json = JSON.stringify(schema);
    expect(json).not.toContain('"$ref"');
    expect(json).not.toContain('"$defs"');
  });
});
