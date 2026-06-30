import type { GetPlanningResult } from '@/lib/db/plannings';
import type { Planning } from '@/lib/types/domain';

export type PlanningState =
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ok'; planning: Planning };

export function resolvePlanningState(result: GetPlanningResult): PlanningState {
  if (result.ok) return { status: 'ok', planning: result.planning };
  if (result.error.kind === 'not_found') return { status: 'empty' };
  return { status: 'error' };
}
