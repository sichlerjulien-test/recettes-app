"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingItemSchema, IngredientCategorySchema } from "@/lib/types/schemas";
import type { ShoppingItem, IngredientCategory } from "@/lib/types/domain";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/ui/labels";

const ShoppingListResponseSchema = z.object({
  items_par_categorie: z.record(
    IngredientCategorySchema,
    z.array(ShoppingItemSchema),
  ),
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
  hasPlanning: boolean;
}

function formatQty(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function ShoppingListSection({ sejourId, token, hasPlanning }: Props) {
  const [itemsByCategory, setItemsByCategory] = useState<Record<
    IngredientCategory,
    ShoppingItem[]
  > | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  function toggleItem(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/sejours/${sejourId}/shopping-list`,
        {
          method: "POST",
          headers: { "X-Sejour-Token": token },
        },
      );
      const json: unknown = await response.json();

      if (!response.ok) {
        const errorParsed = ApiErrorSchema.safeParse(json);
        const message = errorParsed.success
          ? errorParsed.data.error.message
          : "Erreur lors de la génération de la liste";
        toast.error(message);
        return;
      }

      const parsed = ShoppingListResponseSchema.safeParse(json);
      if (!parsed.success) {
        toast.error("Réponse serveur inattendue");
        return;
      }

      setItemsByCategory(parsed.data.items_par_categorie);
      setCheckedItems(new Set());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur réseau";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  if (!hasPlanning) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Liste de courses</h2>
        <p className="text-muted-foreground">
          Générez d&apos;abord un planning pour pouvoir calculer la liste de
          courses.
        </p>
      </section>
    );
  }

  if (itemsByCategory === null) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Liste de courses</h2>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full"
        >
          {isGenerating ? "Génération en cours..." : "Générer la liste de courses"}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Liste de courses</h2>
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "..." : "Recalculer"}
        </Button>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = itemsByCategory[category];
        if (!items || items.length === 0) return null;

        return (
          <article key={category} className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-3">
              {CATEGORY_LABELS[category]}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({items.length} article{items.length > 1 ? "s" : ""})
              </span>
            </h3>
            <ul className="space-y-2">
              {items.map((item, idx) => {
                const key = `${item.ingredient_id}-${item.unite_affichee}`;
                const listKey = `${item.ingredient_id}-${idx}`;
                return (
                  <li
                    key={listKey}
                    className="flex items-baseline gap-2"
                  >
                    <Checkbox
                      checked={checkedItems.has(key)}
                      onCheckedChange={() => toggleItem(key)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1">
                      <span className="font-medium">
                        {formatQty(item.quantite_totale)} {item.unite_affichee}
                      </span>{" "}
                      <span
                        className={
                          checkedItems.has(key)
                            ? "line-through text-muted-foreground"
                            : undefined
                        }
                      >
                        {item.nom_affiche}
                      </span>
                      {item.optionnel && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (optionnel)
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
