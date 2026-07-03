"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoredPlanning, RecettePlanningEntry, Recette, Ingredient, MealType } from "@/lib/types/domain";
import type { PlanningState } from "@/lib/planning/resolve-planning-state";
import { formatIngredientRecette } from "@/lib/ui/format-ingredient-recette";

interface Props {
  planningState: PlanningState;
  recettes: Map<string, Recette>;
  ingredients: Map<string, Ingredient>;
  sejourId: string;
  token: string;
}

export function PlanningSection({ planningState, recettes, ingredients, sejourId, token }: Props) {
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

  const planning: StoredPlanning = planningState.planning;
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
            sejourId={sejourId}
            token={token}
          />
        ))}
      </div>
    </section>
  );
}

function groupByDay(
  entries: StoredPlanning["entries"],
): Record<number, StoredPlanning["entries"]> {
  const grouped: Record<number, StoredPlanning["entries"]> = {};
  for (const entry of entries) {
    (grouped[entry.jour] ??= []).push(entry);
  }
  return grouped;
}

function DayCard({
  jour,
  entries,
  recettes,
  ingredients,
  sejourId,
  token,
}: {
  jour: number;
  entries: StoredPlanning["entries"];
  recettes: Map<string, Recette>;
  ingredients: Map<string, Ingredient>;
  sejourId: string;
  token: string;
}) {
  const sortedEntries = [...entries].sort(
    (a, b) => mealOrder(a.repas) - mealOrder(b.repas),
  );

  return (
    <article className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Jour {jour}</h3>
      <ul className="space-y-2">
        {sortedEntries.map((entry, idx) => {
          if (entry.kind === 'resto') {
            return (
              <li key={`${entry.jour}-${entry.repas}-${idx}`} className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">
                    {mealLabel(entry.repas)}
                  </span>
                  <div className="font-medium text-muted-foreground italic">Resto / non cuisiné</div>
                </div>
              </li>
            );
          }
          const recette = recettes.get(entry.recette_id);
          return (
            <MealEntry
              key={`${entry.jour}-${entry.repas}-${idx}`}
              entry={entry}
              recette={recette}
              ingredients={ingredients}
              sejourId={sejourId}
              token={token}
            />
          );
        })}
      </ul>
    </article>
  );
}

type SwapState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "candidates"; list: Recette[] }
  | { status: "committing" }
  | { status: "no_alternative" }
  | { status: "error"; message: string };

function MealEntry({
  entry,
  recette,
  ingredients,
  sejourId,
  token,
}: {
  entry: RecettePlanningEntry;
  recette: Recette | undefined;
  ingredients: Map<string, Ingredient>;
  sejourId: string;
  token: string;
}) {
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<SwapState>({ status: "idle" });
  const router = useRouter();

  async function openSwap() {
    setSwap({ status: "loading" });
    try {
      const res = await fetch(
        `/api/sejours/${sejourId}/planning/swap?jour=${entry.jour}&repas=${entry.repas}`,
        { headers: { "X-Sejour-Token": token } },
      );
      if (res.status === 422) {
        setSwap({ status: "no_alternative" });
        return;
      }
      if (!res.ok) {
        setSwap({ status: "error", message: "Impossible de charger les alternatives." });
        return;
      }
      const body = await res.json() as { candidates: Recette[] };
      setSwap({ status: "candidates", list: body.candidates });
    } catch {
      setSwap({ status: "error", message: "Erreur réseau." });
    }
  }

  async function commitSwap(recetteId: string) {
    setSwap({ status: "committing" });
    try {
      const res = await fetch(`/api/sejours/${sejourId}/planning/swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sejour-Token": token,
        },
        body: JSON.stringify({ jour: entry.jour, repas: entry.repas, recette_id: recetteId }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { kind: string } };
        const kind = body.error?.kind ?? "unknown";
        setSwap({ status: "error", message: `Échec du swap (${kind}).` });
        return;
      }
      router.refresh();
      setSwap({ status: "idle" });
    } catch {
      setSwap({ status: "error", message: "Erreur réseau lors du swap." });
    }
  }

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

      {/* Swap picker */}
      {swap.status === "idle" && (
        <div className="ml-19 pl-4">
          <button
            type="button"
            onClick={openSwap}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Remplacer ce repas
          </button>
        </div>
      )}

      {swap.status === "loading" && (
        <p className="ml-19 pl-4 text-xs text-muted-foreground">Chargement des alternatives…</p>
      )}

      {swap.status === "no_alternative" && (
        <div className="ml-19 pl-4 space-y-1">
          <p className="text-xs text-muted-foreground">Aucune alternative disponible pour ce créneau.</p>
          <button
            type="button"
            onClick={() => setSwap({ status: "idle" })}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}

      {swap.status === "error" && (
        <div className="ml-19 pl-4 space-y-1">
          <p className="text-xs text-destructive">{swap.message}</p>
          <button
            type="button"
            onClick={() => setSwap({ status: "idle" })}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Fermer
          </button>
        </div>
      )}

      {swap.status === "candidates" && (
        <div className="ml-19 pl-4 space-y-2 border-l">
          <p className="text-xs font-medium text-muted-foreground">Choisissez une alternative :</p>
          <ul className="space-y-1">
            {swap.list.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => commitSwap(candidate.id)}
                  className="text-left w-full text-sm hover:underline"
                >
                  <span className="font-medium">{candidate.nom}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {candidate.duree_minutes} min · {candidate.type_cuisine}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSwap({ status: "idle" })}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}

      {swap.status === "committing" && (
        <p className="ml-19 pl-4 text-xs text-muted-foreground">Remplacement en cours…</p>
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
  entry: RecettePlanningEntry;
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
