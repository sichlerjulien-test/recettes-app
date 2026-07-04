import { test, expect } from '@playwright/test'

// TK-44 — Installabilité PWA brandée.
// Vérifie les critères d'acceptation automatisables :
//   1. <link rel="manifest"> présent et unique.
//   2. <meta name="theme-color"> = #BB4D00 (ambre) = manifest.theme_color.
//   3. <link rel="apple-touch-icon"> présent et asset = 200.
//   4. manifest.json : name, description, theme_color, icône 192 any maskable.

const AMBER = '#BB4D00'

test.describe('PWA metadata', () => {
  test('manifest lié dans le <head>', async ({ page }) => {
    await page.goto('/')
    const links = page.locator('link[rel="manifest"]')
    await expect(links).toHaveCount(1)
    await expect(links.first()).toHaveAttribute('href', '/manifest.json')
  })

  test('theme-color = ambre #BB4D00', async ({ page }) => {
    await page.goto('/')
    const meta = page.locator('meta[name="theme-color"]')
    await expect(meta).toHaveCount(1)
    const content = await meta.getAttribute('content')
    expect(content?.toLowerCase()).toBe(AMBER.toLowerCase())
  })

  test('apple-touch-icon présent et asset 200', async ({ page }) => {
    await page.goto('/')
    const link = page.locator('link[rel="apple-touch-icon"]')
    await expect(link).toHaveCount(1)
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    const response = await page.request.get(href!)
    expect(response.status()).toBe(200)
  })

  test('manifest.json valeurs correctes', async ({ page }) => {
    const response = await page.request.get('/manifest.json')
    expect(response.status()).toBe(200)
    const manifest = await response.json()

    expect(manifest.name).toBe('Meal Planner')
    expect(manifest.description).toBe(
      "Organise les repas d'un séjour entre amis en quelques minutes, avec toutes les contraintes alimentaires respectées et une liste de courses prête."
    )
    expect(manifest.theme_color.toLowerCase()).toBe(AMBER.toLowerCase())

    const icon192 = manifest.icons?.find(
      (i: { sizes: string }) => i.sizes === '192x192'
    )
    expect(icon192).toBeDefined()
    expect(icon192.purpose).toContain('any')
    expect(icon192.purpose).toContain('maskable')
  })

  test('icônes 192 et 512 résolvent en 200', async ({ page }) => {
    for (const src of ['/icons/icon-192x192.png', '/icons/icon-512x512.png']) {
      const response = await page.request.get(src)
      expect(response.status(), `${src} devrait répondre 200`).toBe(200)
    }
  })
})
