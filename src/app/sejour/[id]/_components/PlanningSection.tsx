"use client";

import { useState } from "react";
import type { Planning, Recette, Ingredient, MealType } from "@/lib/types/domain";
import type { PlanningState } from "@/lib/planning/resolve-planning-state";
import { formatIngredientRecette } from "@/lib/ui/format-ingredient-recette";

interface Props {
  planningState: PlanningState;
  recettes: Map<string, Recette>;
  ingredients: Map<string, Ingredient>;
}

export function PlanningSection({ planningState, recettes, ingredients }: Props) {
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
            ingredients={ingredients}
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
  ingredients,
}: {
  jour: number;
  entries: Planning["entries"];
  recettes: Map<string, Recette>;
  ingredients: Map<string, Ingredient>;
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
            <MealEntry
              key={`${entry.jour}-${entry.repas}-${idx}`}
              entry={entry}
              recette={recette}
              ingredients={ingredients}
            />
          );
        })}
      </ul>
    </article>
  );
}

function MealEntry({
  entry,
  recette,
  ingredients,
}: {
  entry: Planning["entries"][number];
  recette: Recette | undefined;
  ingredients: Map<string, Ingredient>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">
          {mealLabel(entry.repas)}
        </span>
        <div className="flex-1">
          <div className="font-medium">
            {recette?.nom ?? entry.recette_id}
          </div>
          {recette && (
            <div className="text-sm text-muted-foreground">
              {recette.duree_minutes} min · {recette.type_cuisine}
            </div>
          )}
        </div>
        <span className="text-muted-foreground text-sm shrink-0" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && recette && (
        <div className="ml-19 pl-4 border-l space-y-3 text-sm">
          <RecipeDetail recette={recette} entry={entry} ingredients={ingredients} />
        </div>
      )}
    </li>
  );
}

function RecipeDetail({
  recette,
  entry,
  ingredients,
}: {
  recette: Recette;
  entry: Planning["entries"][number];
  ingredients: Map<string, Ingredient>;
}) {
  return (
    <>
      <div>
        <p className="font-medium text-muted-foreground mb-1">Étapes</p>
        <ol className="list-decimal list-inside space-y-1">
          {recette.etapes.map((etape, i) => (
            <li key={i}>{etape}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="font-medium text-muted-foreground mb-1">
          Ingrédients ({entry.portions} pers.)
        </p>
        <ul className="space-y-0.5">
          {recette.ingredients.map((ri) => (
            <li key={ri.ingredient_id}>
              {formatIngredientRecette(
                ri,
                ingredients.get(ri.ingredient_id),
                entry.portions,
                recette.portions_base,
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function mealOrder(meal: MealType): number {
  return { 'petit-dejeuner': 0, midi: 1, soir: 2 }[meal] ?? 99;
}

function mealLabel(meal: MealType): string {
  return { 'petit-dejeuner': "Petit-déjeuner", midi: "Midi", soir: "Soir" }[meal] ?? meal;
}
