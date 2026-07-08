import { test, expect } from '@playwright/test'

// TK-60a — Headers de sécurité statiques (défense en profondeur, cf. next.config.ts).
// Rappel : script-src 'unsafe-inline' => cette CSP ne protège PAS contre le XSS.
// La vraie protection nonce-based est TK-60b (ADR requis).

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
