import { use } from "react";

export default function SejourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = use(params);
  const { t: token } = use(searchParams);

  return (
    <main className="container max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Séjour créé</h1>
      <p className="text-muted-foreground">
        Votre séjour a été enregistré. Partagez le lien ci-dessous avec
        les participants pour qu&apos;ils puissent y accéder.
      </p>
      <div className="rounded-lg border bg-muted p-4 break-all font-mono text-sm">
        {`/sejour/${id}?t=${token ?? "MISSING_TOKEN"}`}
      </div>
      <p className="text-sm text-muted-foreground">
        Note : la génération du planning et l&apos;affichage complet du séjour
        seront ajoutés dans la prochaine sous-tâche.
      </p>
    </main>
  );
}
