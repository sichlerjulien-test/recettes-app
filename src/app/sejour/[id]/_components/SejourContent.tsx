"use client";

import { PlanningSection } from "./PlanningSection";
import { ShoppingListSection } from "./ShoppingListSection";
import type { Recette, Ingredient } from "@/lib/types/domain";
import type { PlanningState } from "@/lib/planning/resolve-planning-state";

interface Props {
  sejourId: string;
  token: string;
  planningState: PlanningState;
  recettes: Map<string, Recette>;
  ingredients: Map<string, Ingredient>;
}

export function SejourContent({
  sejourId,
  token,
  planningState,
  recettes,
  ingredients,
}: Props) {
  return (
    <>
      <PlanningSection
        planningState={planningState}
        recettes={recettes}
        ingredients={ingredients}
        sejourId={sejourId}
        token={token}
      />
      <ShoppingListSection
        sejourId={sejourId}
        token={token}
        hasPlanning={planningState.status === 'ok'}
      />
    </>
  );
}
