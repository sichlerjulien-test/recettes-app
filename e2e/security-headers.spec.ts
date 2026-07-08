import { test, expect } from '@playwright/test'

// TK-60a — Headers de sécurité statiques (défense en profondeur, cf. next.config.ts).
// Rappel : script-src 'unsafe-inline' => cette CSP ne protège PAS contre le XSS.
// La vraie protection nonce-based est TK-60b (ADR requis).
//
// Couverture E2E : cette suite tourne contre `npm run dev` (webServer de
// playwright.config.ts), donc NODE_ENV=development — la CSP observée ici inclut
// 'unsafe-eval' (voir src/lib/security/csp.ts). L'invariant "pas d'unsafe-eval en
// prod" est verrouillé séparément par le test unitaire csp.test.ts, pas ici.
// Idem, le service worker PWA est désactivé en dev (next.config.ts, disable:
// NODE_ENV === 'development') : l'interaction SW ↔ CSP (precache, manifest-src,
// worker-src) a été validée manuellement (npm run build + onglet Application),
// pas par cette suite automatisée. Même schéma que la note couverture de TK-38.

test.describe('Headers de sécurité', () => {
  test('page racine porte les 4 headers attendus', async ({ page }) => {
    const response = await page.goto('/')
    expect(response).not.toBeNull()
    const headers = response!.headers()

    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')

    const csp = headers['content-security-policy']
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("worker-src 'self'")
    expect(csp).toContain("manifest-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })
})
