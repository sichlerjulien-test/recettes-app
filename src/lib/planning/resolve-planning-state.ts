import type { GetPlanningResult } from '@/lib/db/plannings';
import type { StoredPlanning } from '@/lib/types/domain';

export type PlanningState =
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ok'; planning: StoredPlanning };

export function resolvePlanningState(result: GetPlanningResult): PlanningState {
  if (result.ok) return { status: 'ok', planning: result.planning };
  if (result.error.kind === 'not_found') return { status: 'empty' };
  return { status: 'error' };
}
