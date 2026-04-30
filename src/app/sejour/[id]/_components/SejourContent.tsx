"use client";

import { useState } from "react";
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
  const [planning, setPlanning] = useState<Planning | null>(initialPlanning);

  return (
    <>
      <PlanningSection
        sejourId={sejourId}
        token={token}
        planning={planning}
        recettes={recettes}
        onPlanningGenerated={setPlanning}
      />
      <ShoppingListSection
        sejourId={sejourId}
        token={token}
        hasPlanning={planning !== null}
      />
    </>
  );
}
