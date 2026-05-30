"use client";

import { PlanningSection } from "./PlanningSection";
import { ShoppingListSection } from "./ShoppingListSection";
import type { Planning, Recette } from "@/lib/types/domain";

interface Props {
  sejourId: string;
  token: string;
  initialPlanning: Planning | null;
  recettes: Map<string, Recette>;
}

export function SejourContent({
  sejourId,
  token,
  initialPlanning,
  recettes,
}: Props) {
  return (
    <>
      <PlanningSection
        planning={initialPlanning}
        recettes={recettes}
      />
      <ShoppingListSection
        sejourId={sejourId}
        token={token}
        hasPlanning={initialPlanning !== null}
      />
    </>
  );
}
