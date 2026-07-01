"use client";

import type { Planning, Recette, MealType } from "@/lib/types/domain";
import type { PlanningState } from "@/lib/planning/resolve-planning-state";

interface Props {
  planningState: PlanningState;
  recettes: Map<string, Recette>;
}

export function PlanningSection({ planningState, recettes }: Props) {
  if (planningState.status === 'empty') {
    return (
      <section className="space-y-4">
        <p className="text-muted-foreground">
          Aucun planning généré pour ce séjour. Utilisez le bouton{" "}
          <strong>Modifier</strong> pour relancer la génération.
        </p>
      </section>
    );
  }

  if (planningState.status === 'error') {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Planning</h2>
        <p className="text-destructive">
          Erreur de chargement du planning. Rechargez la page ou contactez
          l&apos;organisateur si le problème persiste.
        </p>
      </section>
    );
  }

  const planning = planningState.planning;

  const entriesByDay = groupByDay(planning.entries);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Planning</h2>
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
  return { 'petit-dejeuner': 0, midi: 1, soir: 2 }[meal] ?? 99;
}

function mealLabel(meal: MealType): string {
  return { 'petit-dejeuner': "Petit-déjeuner", midi: "Midi", soir: "Soir" }[meal] ?? meal;
}
