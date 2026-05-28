import { describe, expect, it } from 'vitest';
import { buildSequence } from './build-sequence';
import type { PlanningSlot } from './build-sequence';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slot(jour: number, repas: PlanningSlot['repas']): PlanningSlot {
  return { jour, repas };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildSequence', () => {

  // ── Cas nominaux ─────────────────────────────────────────────────────────────

  it("départ matin, 2 jours complets : produit 6 slots dans l'ordre canonique", () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 2 });
    expect(result).toEqual([
      slot(1, 'petit-dejeuner'),
      slot(1, 'midi'),
      slot(1, 'soir'),
      slot(2, 'petit-dejeuner'),
      slot(2, 'midi'),
      slot(2, 'soir'),
    ]);
  });

  it('départ midi, 2 jours : démarre au midi du jour 1, brunchs ignorés (0)', () => {
    const result = buildSequence({ premier_repas: 'midi', midis: 2, soirs: 2, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'midi'),
      slot(1, 'soir'),
      slot(2, 'midi'),
      slot(2, 'soir'),
    ]);
  });

  it('départ soir, midis=1, soirs=2, brunchs=0 : soir j1, puis midi+soir j2', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 1, soirs: 2, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'soir'),
      slot(2, 'midi'),
      slot(2, 'soir'),
    ]);
  });

  // ── Cas séjour 1 jour ─────────────────────────────────────────────────────────

  it('séjour 1 jour depuis matin avec 3 repas : les 3 slots sur le jour 1', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 1, soirs: 1, brunchs: 1 });
    expect(result).toEqual([
      slot(1, 'petit-dejeuner'),
      slot(1, 'midi'),
      slot(1, 'soir'),
    ]);
  });

  it('séjour 1 jour depuis midi : midi+soir uniquement sur jour 1', () => {
    const result = buildSequence({ premier_repas: 'midi', midis: 1, soirs: 1, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'midi'),
      slot(1, 'soir'),
    ]);
  });

  it('séjour 1 jour depuis soir : un seul soir sur jour 1', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 0, soirs: 1, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'soir'),
    ]);
  });

  // ── Cas X=0 (brunchs) ────────────────────────────────────────────────────────

  it('X=0 : aucun petit-déjeuner, midis et soirs seulement', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 });
    const repasTypes = result.map((s) => s.repas);
    expect(repasTypes).not.toContain('petit-dejeuner');
    expect(repasTypes.filter((r) => r === 'midi')).toHaveLength(2);
    expect(repasTypes.filter((r) => r === 'soir')).toHaveLength(2);
  });

  it('X=0, départ matin : saute le créneau matin et démarre au midi du jour 1', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0 });
    expect(result[0]).toEqual(slot(1, 'midi'));
  });

  // ── Cas Y=0 (midis) ──────────────────────────────────────────────────────────

  it('Y=0 : aucun midi, brunchs et soirs seulement', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 0, soirs: 2, brunchs: 2 });
    const repasTypes = result.map((s) => s.repas);
    expect(repasTypes).not.toContain('midi');
    expect(repasTypes.filter((r) => r === 'petit-dejeuner')).toHaveLength(2);
    expect(repasTypes.filter((r) => r === 'soir')).toHaveLength(2);
  });

  it('Y=0, départ midi : saute midi et démarre au soir j1', () => {
    const result = buildSequence({ premier_repas: 'midi', midis: 0, soirs: 2, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'soir'),
      slot(2, 'soir'),
    ]);
  });

  // ── Cas Z=0 (soirs) ──────────────────────────────────────────────────────────

  it('Z=0 : aucun soir, brunchs et midis seulement', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 2, soirs: 0, brunchs: 2 });
    const repasTypes = result.map((s) => s.repas);
    expect(repasTypes).not.toContain('soir');
    expect(repasTypes.filter((r) => r === 'midi')).toHaveLength(2);
  });

  // ── Cas tout à 0 ─────────────────────────────────────────────────────────────

  it('tout à 0 : retourne un tableau vide', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 0, soirs: 0, brunchs: 0 });
    expect(result).toEqual([]);
  });

  it('tout à 0, départ soir : retourne aussi un tableau vide', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 0, soirs: 0, brunchs: 0 });
    expect(result).toEqual([]);
  });

  // ── Compteurs exacts ─────────────────────────────────────────────────────────

  it('produit exactement X+Y+Z slots', () => {
    const cases = [
      { premier_repas: 'matin' as const, midis: 3, soirs: 2, brunchs: 1 },
      { premier_repas: 'midi' as const, midis: 0, soirs: 5, brunchs: 2 },
      { premier_repas: 'soir' as const, midis: 4, soirs: 4, brunchs: 3 },
    ];
    for (const repartition of cases) {
      const result = buildSequence(repartition);
      const expected = repartition.midis + repartition.soirs + repartition.brunchs;
      expect(result).toHaveLength(expected);
    }
  });

  it('consomme exactement X brunchs, Y midis, Z soirs', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 3, soirs: 2, brunchs: 1 });
    expect(result.filter((s) => s.repas === 'petit-dejeuner')).toHaveLength(1);
    expect(result.filter((s) => s.repas === 'midi')).toHaveLength(3);
    expect(result.filter((s) => s.repas === 'soir')).toHaveLength(2);
  });

  // ── Ordre canonique ───────────────────────────────────────────────────────────

  it('la séquence est ordonnée : pour un même jour, matin < midi < soir', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 3, soirs: 3, brunchs: 3 });
    const ORDER = { 'petit-dejeuner': 0, midi: 1, soir: 2 };
    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i]!;
      const b = result[i + 1]!;
      if (a.jour === b.jour) {
        expect(ORDER[a.repas]).toBeLessThan(ORDER[b.repas]);
      }
    }
  });

  it('les numéros de jour sont croissants (jamais de recul)', () => {
    const result = buildSequence({ premier_repas: 'midi', midis: 3, soirs: 3, brunchs: 2 });
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.jour).toBeLessThanOrEqual(result[i + 1]!.jour);
    }
  });

  it('le jour démarre à 1', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 1, soirs: 1, brunchs: 0 });
    expect(result[0]!.jour).toBe(1);
  });

  // ── Cas départ tardif (soir) ──────────────────────────────────────────────────

  it('départ soir avec midis=2, soirs=3, brunchs=0 : j1 soir + j2 midi+soir + j3 midi+soir', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 2, soirs: 3, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'soir'),
      slot(2, 'midi'),
      slot(2, 'soir'),
      slot(3, 'midi'),
      slot(3, 'soir'),
    ]);
  });

  // ── Cas un seul type de repas ─────────────────────────────────────────────────

  it('uniquement des midis : 3 midis sur 3 jours consécutifs', () => {
    const result = buildSequence({ premier_repas: 'matin', midis: 3, soirs: 0, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'midi'),
      slot(2, 'midi'),
      slot(3, 'midi'),
    ]);
  });

  it('uniquement des soirs : 2 soirs depuis midi', () => {
    const result = buildSequence({ premier_repas: 'midi', midis: 0, soirs: 2, brunchs: 0 });
    expect(result).toEqual([
      slot(1, 'soir'),
      slot(2, 'soir'),
    ]);
  });

  it('uniquement des brunchs depuis soir : 2 petits-déjeuners j2 et j3', () => {
    const result = buildSequence({ premier_repas: 'soir', midis: 0, soirs: 0, brunchs: 2 });
    expect(result).toEqual([
      slot(2, 'petit-dejeuner'),
      slot(3, 'petit-dejeuner'),
    ]);
  });

  // ── Déterminisme ─────────────────────────────────────────────────────────────

  it('est déterministe : deux appels identiques retournent le même résultat', () => {
    const repartition = { premier_repas: 'midi' as const, midis: 3, soirs: 3, brunchs: 1 };
    const result1 = buildSequence(repartition);
    const result2 = buildSequence(repartition);
    expect(result1).toEqual(result2);
  });

});
