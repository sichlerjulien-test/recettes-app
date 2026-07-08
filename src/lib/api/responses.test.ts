import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodValidationResponse } from './responses';

describe('zodValidationResponse', () => {
  it('retourne 400 avec message générique et le détail Zod dans details', async () => {
    const schema = z.object({ sejour_id: z.string().uuid() });
    const parsed = schema.safeParse({ sejour_id: 'pas-un-uuid' });
    if (parsed.success) throw new Error('fixture invalide');

    const res = zodValidationResponse(parsed.error);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.kind).toBe('validation_failed');
    expect(body.error.message).toBe('Données invalides');
    expect(body.error.details).toBeDefined();
    expect(JSON.stringify(body.error.details)).toContain('sejour_id');
  });
});
