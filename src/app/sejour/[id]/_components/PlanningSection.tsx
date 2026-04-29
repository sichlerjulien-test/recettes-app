"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { PlanningSchema } from "@/lib/types/schemas";
import type { Planning, Recette, MealType } from "@/lib/types/domain";

const GeneratePlanningResponseSchema = z.object({
  planning: PlanningSchema,
});

const ApiErrorSchema = z.object({
  error: z.object({
    kind: z.string(),
    message: z.string(),
  }),
});

interface Props {
  sejourId: string;
  token: string;
  initialPlanning: Planning | null;
  recettes: Map<string, Recette>;
}

export function PlanningSection({
  sejourId,
  token,
  initialPlanning,
  recettes,
}: Props) {
  const [planning, setPlanning] = useState<Planning | null>(initialPlanning);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/sejours/${sejourId}/planning`, {
        method: "POST",
        headers: { "X-Sejour-Token": token },
      });
      const json: unknown = await response.json();

      if (!response.ok) {
        const errorParsed = ApiErrorSchema.safeParse(json);
        const message = errorParsed.success
          ? errorParsed.data.error.message
          : "Erreur lors de la génération";
        toast.error(message);
        return;
      }

      const parsed = GeneratePlanningResponseSchema.safeParse(json);
      if (!parsed.success) {
        toast.error("Réponse serveur inattendue");
        return;
      }

      setPlanning(parsed.data.planning);
      toast.success("Planning généré");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur réseau";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  if (!planning) {
    return (
      <section className="space-y-4">
        <p className="text-muted-foreground">
          Aucun planning généré pour ce séjour. La génération prend quelques
          secondes (utilise un modèle IA pour composer un planning conforme
          aux contraintes de chaque participant).
        </p>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full"
        >
          {isGenerating ? "Génération en cours..." : "Générer le planning"}
        </Button>
      </section>
    );
  }

  const entriesByDay = groupByDay(planning.entries);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Planning</h2>
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "..." : "Régénérer"}
        </Button>
      </div>
      <div className="space-y-4">
        {Object.entries(entriesByDay).map(([jour, entries]) => (
          <DayCard
            key={jour}
            jour={Number(jour)}
            entries={entries}
            recettes={recettes}
          />
        ))}
      </div>
    </section>
  );
}

function groupByDay(
  entries: Planning["entries"],
): Record<number, Planning["entries"]> {
  const grouped: Record<number, Planning["entries"]> = {};
  for (const entry of entries) {
    if (!grouped[entry.jour]) grouped[entry.jour] = [];
    grouped[entry.jour]!.push(entry);
  }
  return grouped;
}

function DayCard({
  jour,
  entries,
  recettes,
}: {
  jour: number;
  entries: Planning["entries"];
  recettes: Map<string, Recette>;
}) {
  const sortedEntries = [...entries].sort(
    (a, b) => mealOrder(a.repas) - mealOrder(b.repas),
  );

  return (
    <article className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Jour {jour}</h3>
      <ul className="space-y-2">
        {sortedEntries.map((entry, idx) => {
          const recette = recettes.get(entry.recette_id);
          return (
            <li
              key={`${entry.jour}-${entry.repas}-${idx}`}
              className="flex items-baseline gap-3"
            >
              <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">
                {mealLabel(entry.repas)}
              </span>
              <div>
                <div className="font-medium">
                  {recette?.nom ?? entry.recette_id}
                </div>
                {recette && (
                  <div className="text-sm text-muted-foreground">
                    {recette.duree_minutes} min · {recette.type_cuisine}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function mealOrder(meal: MealType): number {
  return { brunch: 0, midi: 1, soir: 2 }[meal] ?? 99;
}

function mealLabel(meal: MealType): string {
  return { brunch: "Brunch", midi: "Midi", soir: "Soir" }[meal] ?? meal;
}
