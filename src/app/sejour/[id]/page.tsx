import { getSejourById } from "@/lib/db/sejours";
import { getPlanningBySejourId } from "@/lib/db/plannings";
import { getAllRecettesAsMap } from "@/lib/db/recettes";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SejourContent } from "./_components/SejourContent";
import { ShareLink } from "./_components/ShareLink";
import { getSiteUrl } from "@/lib/url";

export default async function SejourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token } = await searchParams;

  if (!token) {
    return (
      <main className="container max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Token manquant</h1>
        <p className="text-muted-foreground">
          Le lien de partage est incomplet. Demandez à l&apos;organisateur du
          séjour le lien complet.
        </p>
      </main>
    );
  }

  const [sejourResult, planningResult, recettesResult] = await Promise.all([
    getSejourById(id),
    getPlanningBySejourId(id),
    getAllRecettesAsMap(),
  ]);

  if (!sejourResult.ok) {
    if (sejourResult.error.kind === "not_found") notFound();
    return (
      <main className="container max-w-2xl mx-auto p-6">
        <p className="text-destructive">Erreur de chargement du séjour</p>
      </main>
    );
  }

  // La vérification du token est intentionnellement répétée ici (page SSR)
  // et dans le Route Handler (POST/GET /api/sejours/:id/planning).
  // Le Server Component protège le rendu côté serveur ; le Route Handler
  // protège l'accès aux données via API.
  // TODO(Sprint 2+) : centraliser via un helper auth quand Supabase Auth sera introduit.
  if (sejourResult.sejour.token !== token) {
    return (
      <main className="container max-w-2xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Accès refusé</h1>
        <p className="text-muted-foreground">
          Le lien que vous utilisez n&apos;est pas valide pour ce séjour.
        </p>
      </main>
    );
  }

  if (!recettesResult.ok) {
    return (
      <main className="container max-w-2xl mx-auto p-6">
        <p className="text-destructive">
          Erreur de chargement du catalogue de recettes
        </p>
      </main>
    );
  }

  const initialPlanning = planningResult.ok ? planningResult.planning : null;
  const shareUrl = `${await getSiteUrl()}/sejour/${id}?t=${token}`;

  return (
    <main className="container max-w-2xl mx-auto p-6 space-y-8">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {sejourResult.sejour.nom ?? "Séjour"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {sejourResult.sejour.nb_jours} jours,{" "}
              {sejourResult.sejour.participants.length} participant(s)
            </p>
          </div>
          <Link
            href={`/sejour/${id}/edit?t=${token}`}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            Modifier
          </Link>
        </div>
      </header>

      <SejourContent
        sejourId={id}
        token={token}
        initialPlanning={initialPlanning}
        recettes={recettesResult.recettes}
      />

      <section className="space-y-3 pt-4 border-t">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Lien à partager</h2>
          <p className="text-sm text-muted-foreground">
            Envoyez ce lien aux participants pour qu&apos;ils puissent
            consulter le séjour.
          </p>
        </div>
        <ShareLink url={shareUrl} />
      </section>
    </main>
  );
}
