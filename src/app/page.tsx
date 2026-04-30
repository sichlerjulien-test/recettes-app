import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="container max-w-2xl mx-auto px-6 py-12 flex-1 flex flex-col gap-12">
      <section className="space-y-6 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
          Meal Planner
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Du week-end au road trip, des repas pour tout le monde sans
          se prendre la tête.
        </p>

        <ul className="space-y-2 text-base">
          <li className="flex gap-2">
            <span aria-hidden>→</span>
            <span>Plats adaptés aux contraintes de chaque participant</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>→</span>
            <span>Liste de courses prête à l&apos;emploi</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>→</span>
            <span>Zéro friction, zéro inscription</span>
          </li>
        </ul>

        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/nouveau-sejour">Créer un séjour</Link>
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Comment ça marche</h2>
        <ol className="space-y-3 text-base">
          <li className="flex gap-3">
            <span className="font-semibold text-muted-foreground shrink-0">1.</span>
            <span>Décrivez votre séjour et vos amis</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-muted-foreground shrink-0">2.</span>
            <span>Notre IA compose un menu adapté</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-muted-foreground shrink-0">3.</span>
            <span>La liste de courses suit, prête à imprimer</span>
          </li>
        </ol>
      </section>
    </main>
  );
}
