// TK-60a — durcissement défense en profondeur, PAS une protection anti-XSS :
// script-src garde 'unsafe-inline', donc cette CSP ne bloque pas un <script> injecté.
// La vraie protection nonce-based est différée à TK-60b (ADR requis, cf. backlog).
// connect-src reste 'self' : le seul client Supabase (src/lib/db/supabase.ts) est
// server-only (service_role key), aucun composant navigateur n'y accède directement.
export function buildCsp(nodeEnv: string | undefined): string {
  // 'unsafe-eval' ajouté seulement en dev : Fast Refresh/React DevTools s'appuient
  // sur eval() pour reconstruire les callstacks, absent en production. Invariant
  // pinné par csp.test.ts — ne pas laisser une prod hériter de 'unsafe-eval' en silence.
  const scriptSrc =
    nodeEnv === 'development'
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
