import type { MealType } from '../types/domain';

export interface PlanningSlot {
  jour: number;
  repas: MealType;
}

interface RepartitionRepas {
  premier_repas: 'matin' | 'midi' | 'soir';
  midis: number;
  soirs: number;
  brunchs: number;
}

const CANONICAL_ORDER: Array<{ creneau: 'matin' | 'midi' | 'soir'; repas: MealType }> = [
  { creneau: 'matin', repas: 'petit-dejeuner' },
  { creneau: 'midi', repas: 'midi' },
  { creneau: 'soir', repas: 'soir' },
];

/**
 * Produit la liste ordonnée des slots {jour, repas} à remplir par le planning.
 *
 * Démarre au créneau premier_repas du jour 1, avance dans l'ordre canonique
 * matin→midi→soir en bouclant. Consomme exactement brunchs matins,
 * midis midis et soirs soirs dans l'ordre d'apparition.
 *
 * Fonction pure et déterministe : même entrée → même sortie.
 */
export function buildSequence(repartition: RepartitionRepas): PlanningSlot[] {
  const { premier_repas, midis, soirs, brunchs } = repartition;

  const remaining = { matin: brunchs, midi: midis, soir: soirs };
  const total = brunchs + midis + soirs;

  if (total === 0) return [];

  const startIndex = CANONICAL_ORDER.findIndex((c) => c.creneau === premier_repas);
  const slots: PlanningSlot[] = [];
  let jour = 1;
  let creneauIndex = startIndex;
  let emitted = 0;

  while (emitted < total) {
    const canonical = CANONICAL_ORDER[creneauIndex]!;

    if (remaining[canonical.creneau] > 0) {
      slots.push({ jour, repas: canonical.repas });
      remaining[canonical.creneau]--;
      emitted++;
    }

    const nextIndex = (creneauIndex + 1) % CANONICAL_ORDER.length;
    if (nextIndex === 0) {
      jour++;
    }
    creneauIndex = nextIndex;
  }

  return slots;
}
