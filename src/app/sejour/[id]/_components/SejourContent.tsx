"use client";

import { PlanningSection } from "./PlanningSection";
import { ShoppingListSection } from "./ShoppingListSection";
import type { Recette } from "@/lib/types/domain";
import type { PlanningState } from "@/lib/planning/resolve-planning-state";

interface Props {
  sejourId: string;
  token: string;
  planningState: PlanningState;
  recettes: Map<string, Recette>;
}

export function SejourContent({
  sejourId,
  token,
  planningState,
  recettes,
}: Props) {
  return (
    <>
      <PlanningSection
        planningState={planningState}
        recettes={recettes}
      />
      <ShoppingListSection
        sejourId={sejourId}
        token={token}
        hasPlanning={planningState.status === 'ok'}
      />
    </>
  );
}
