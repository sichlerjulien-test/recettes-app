import { describe, it, expect } from 'vitest';
import { CreateSejourBodySchema } from '@/lib/types/schemas';
import { determineRegenerationAction } from '@/lib/ui/regeneration';

// ─── Logique de re-génération ─────────────────────────────────────────────────

describe('determineRegenerationAction', () => {
  it('demande confirmation quand un planning existe', () => {
    expect(determineRegenerationAction(true)).toBe('confirm');
  });

  it('génère directement quand aucun planning n\'existe', () => {
    expect(determineRegenerationAction(false)).toBe('generate');
  });
});

// ─── Validation Zod PATCH identique au POST ───────────────────────────────────

const VALID_BODY = {
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 3, soirs: 3, brunchs: 1, slots_resto: [] },
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['plaque'],
    temps_disponible: 'standard',
  },
  participants: [
    { nom: 'Alice', allergies: [], exclusions: [], aime: [], n_aime_pas: [] },
  ],
};

describe('CreateSejourBodySchema (schéma partagé POST + PATCH)', () => {
  it('accepte des données valides complètes', () => {
    expect(CreateSejourBodySchema.safeParse(VALID_BODY).success).toBe(true);
  });

  it('accepte un nom optionnel', () => {
    const withName = { ...VALID_BODY, nom: 'Chalet été' };
    expect(CreateSejourBodySchema.safeParse(withName).success).toBe(true);
  });

  it('accepte une date_debut optionnelle au format YYYY-MM-DD', () => {
    const withDate = { ...VALID_BODY, date_debut: '2026-07-14' };
    expect(CreateSejourBodySchema.safeParse(withDate).success).toBe(true);
  });

  it('refuse nb_jours = 0', () => {
    const result = CreateSejourBodySchema.safeParse({ ...VALID_BODY, nb_jours: 0 });
    expect(result.success).toBe(false);
  });

  it('refuse nb_jours > 7', () => {
    const result = CreateSejourBodySchema.safeParse({ ...VALID_BODY, nb_jours: 8 });
    expect(result.success).toBe(false);
  });

  it('refuse une liste de participants vide', () => {
    const result = CreateSejourBodySchema.safeParse({ ...VALID_BODY, participants: [] });
    expect(result.success).toBe(false);
  });

  it('refuse plus de 12 participants', () => {
    const tooMany = Array.from({ length: 13 }, (_, i) => ({
      nom: `P${i}`, allergies: [], exclusions: [], aime: [], n_aime_pas: [],
    }));
    const result = CreateSejourBodySchema.safeParse({ ...VALID_BODY, participants: tooMany });
    expect(result.success).toBe(false);
  });

  it('refuse un equipement_disponible vide', () => {
    const result = CreateSejourBodySchema.safeParse({
      ...VALID_BODY,
      parametres: { ...VALID_BODY.parametres, equipement_disponible: [] },
    });
    expect(result.success).toBe(false);
  });

  it('refuse un niveau_cuisine invalide', () => {
    const result = CreateSejourBodySchema.safeParse({
      ...VALID_BODY,
      parametres: { ...VALID_BODY.parametres, niveau_cuisine: 'expert' },
    });
    expect(result.success).toBe(false);
  });

  it('refuse une date_debut mal formatée', () => {
    const result = CreateSejourBodySchema.safeParse({ ...VALID_BODY, date_debut: '14-07-2026' });
    expect(result.success).toBe(false);
  });
});
