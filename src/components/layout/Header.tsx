import Link from "next/link";

export function Header() {
  return (
    <header className="border-b bg-background">
      <div className="container max-w-2xl mx-auto px-6 py-4">
        <Link href="/" className="text-lg font-semibold hover:opacity-80">
          Meal Planner
        </Link>
      </div>
    </header>
  );
}
