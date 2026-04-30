import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="container max-w-2xl mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center text-center space-y-6">
      <h1 className="text-3xl font-bold">Page introuvable</h1>
      <p className="text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou n&apos;est plus disponible.
      </p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
