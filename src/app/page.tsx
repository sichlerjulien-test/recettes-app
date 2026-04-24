const FEATURES = [
  {
    title: 'Contraintes alimentaires respectées',
    detail: "Allergies, régimes — personne n'est oublié.",
  },
  {
    title: 'Planning de repas généré en un tap',
    detail: 'Midis, soirs, brunchs — tout planifié automatiquement.',
  },
  {
    title: 'Liste de courses prête pour le supermarché',
    detail: 'Quantités calculées, triées par rayon.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex justify-center pt-6 px-4">
        <span className="text-xs text-gray-400 bg-white border border-gray-100 px-3 py-1 rounded-full">
          Sprint 0 — en construction
        </span>
      </div>

      <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-4 pt-14 pb-12 w-full">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl font-bold text-gray-900 text-center mb-3 tracking-tight">
            Meal Planner
          </h1>
          <p className="text-base text-gray-500 text-center mb-10 leading-relaxed">
            Planifie tes repas et ta liste de courses en groupe, sans prise de tête.
          </p>

          <div className="flex flex-col gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-xl border border-gray-100 px-5 py-4"
              >
                <div className="w-2 h-2 rounded-full bg-teal-400 mb-2" />
                <p className="text-sm font-medium text-gray-800">{f.title}</p>
                <p className="text-xs text-gray-400 mt-1">{f.detail}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-10 text-center">
            Interface bientôt disponible.
          </p>
        </div>
      </main>
    </div>
  );
}
