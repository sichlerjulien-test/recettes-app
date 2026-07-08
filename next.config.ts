import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

// TK-60a — durcissement défense en profondeur, PAS une protection anti-XSS :
// script-src garde 'unsafe-inline', donc cette CSP ne bloque pas un <script> injecté.
// La vraie protection nonce-based est différée à TK-60b (ADR requis, cf. backlog).
// connect-src reste 'self' : le seul client Supabase (src/lib/db/supabase.ts) est
// server-only (service_role key), aucun composant navigateur n'y accède directement.
// 'unsafe-eval' ajouté seulement en dev : Fast Refresh/React DevTools s'appuient
// sur eval() pour reconstruire les callstacks, absent en production.
const scriptSrc =
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
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

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ];
  },
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
