import { test, expect } from '@playwright/test'

// TK-27 — Light-only : vérifie que le fond reste clair même quand l'OS est en dark.
// Régresse si un dark: passe à travers (ex. nouveau @media ou classe .dark posée).
test('background reste clair quand colorScheme OS = dark', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto('/')

  // Résoudre via canvas pour être insensible au format de couleur CSS retourné
  // (oklch(1 0 0) peut être sérialisé en lab(100 0 0) selon le navigateur).
  const { r, g, b } = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2] }
  })

  // --background: oklch(1 0 0) = blanc pur → r/g/b tous à 255
  expect(r).toBeGreaterThan(240)
  expect(g).toBeGreaterThan(240)
  expect(b).toBeGreaterThan(240)

  await context.close()
})
