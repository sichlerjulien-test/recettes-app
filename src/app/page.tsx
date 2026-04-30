import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ShoppingCart, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="container max-w-3xl mx-auto px-6 py-16 sm:py-24 space-y-8">
        <div className="space-y-6 text-center sm:text-left">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight">
            Planifiez les repas
            <br />
            d&apos;un séjour entre amis.
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
            Du week-end au road trip, des repas pour tout le monde
            sans se prendre la tête.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center pt-2">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/nouveau-sejour">Créer un séjour</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Aucune inscription nécessaire.
            </p>
          </div>
        </div>
      </section>

      <section className="container max-w-3xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-3 gap-4">
          <article className="rounded-xl border bg-card p-6 space-y-3">
            <ShieldCheck className="size-6 text-primary" />
            <h3 className="font-semibold">Allergies respectées</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Plats adaptés aux contraintes alimentaires de chaque participant.
            </p>
          </article>

          <article className="rounded-xl border bg-card p-6 space-y-3">
            <Sparkles className="size-6 text-primary" />
            <h3 className="font-semibold">Menu intelligent</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Une IA compose un planning équilibré et varié en quelques secondes.
            </p>
          </article>

          <article className="rounded-xl border bg-card p-6 space-y-3">
            <ShoppingCart className="size-6 text-primary" />
            <h3 className="font-semibold">Courses prêtes</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Liste agrégée par rayon, à imprimer ou à cocher sur place.
            </p>
          </article>
        </div>
      </section>

      <section className="container max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border bg-muted/40 p-8 sm:p-12 space-y-6">
          <h2 className="text-2xl font-bold">Comment ça marche</h2>
          <ol className="space-y-5">
            <li className="flex gap-4">
              <span className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm shrink-0">
                1
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">Décrivez votre séjour</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Nombre de jours, repas à prévoir, équipement de cuisine
                  disponible, et la liste des participants avec leurs
                  contraintes alimentaires.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm shrink-0">
                2
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">L&apos;IA compose le menu</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  En 5 secondes, un planning de repas adapté à toutes
                  les contraintes du groupe.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm shrink-0">
                3
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">Récupérez votre liste de courses</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Calculée automatiquement, agrégée par rayon, prête à
                  emporter au supermarché.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </main>
  );
}
