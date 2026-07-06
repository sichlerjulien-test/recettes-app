import { test, expect } from '@playwright/test'

// TK-51 — plus jamais de flash retour au formulaire entre la génération du
// planning et l'affichage de la page de destination. Le bug : `setIsGenerating(false)`
// s'exécutait de façon synchrone dans le `finally` de handleSubmit, avant que
// `router.push` (transition App Router non attendable) ait complété la navigation,
// ce qui levait l'overlay et laissait réapparaître le formulaire pendant un tick.
//
// La destination réelle (/sejour/[id]) est un Server Component qui lit une vraie
// DB : seeder une DB réelle ou mocker le flux RSC interne (fetch `_rsc=` — format
// de sérialisation React Server Components, non mockable en JSON simple) est hors
// scope pour ce test de comportement client. On utilise un UUID inexistant : la
// navigation aboutit réellement à la page "Page introuvable" (not-found.tsx), ce
// qui donne un signal de destination stable et déterministe sans dépendance DB —
// suffisant pour prouver l'absence de flash, objet du ticket.

const UUID_SEJOUR = '00000005-0000-4000-8000-000000000001'
const UUID_TOKEN = '00000005-0000-4000-8000-000000000002'

test.describe('TK-51 — Flash overlay → navigation (nouveau-sejour)', () => {
  test('aucun retour au formulaire visible entre overlay et affichage de la destination', async ({ page }) => {
    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: UUID_SEJOUR, token: UUID_TOKEN }),
        })
      } else {
        await route.continue()
      }
    })

    // Délai artificiel pour élargir la fenêtre de la course overlay ↔ navigation.
    await page.route(`**/api/sejours/${UUID_SEJOUR}/planning`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/nouveau-sejour')
    await page.getByLabel('Nom', { exact: true }).first().fill('Alice')

    const submitButton = page.getByRole('button', { name: /Créer et générer/ })
    const overlay = page.getByText('Génération du planning en cours...')
    const destination = page.getByText('Page introuvable')

    let sawNeither = false
    let sawSubmitAfterClick = false
    let polling = true
    let clicked = false

    const poll = (async () => {
      while (polling) {
        const [overlayVisible, destinationVisible, submitVisible] = await Promise.all([
          overlay.isVisible().catch(() => false),
          destination.isVisible().catch(() => false),
          submitButton.isVisible().catch(() => false),
        ])
        if (clicked && !overlayVisible && !destinationVisible) sawNeither = true
        // Le bouton reste dans le DOM sous l'overlay (couvert visuellement) —
        // seul le cas "bouton visible alors que l'overlay est levé" est un flash réel.
        if (clicked && submitVisible && !overlayVisible) sawSubmitAfterClick = true
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    })()

    await submitButton.click()
    clicked = true
    await expect(destination).toBeVisible({ timeout: 5000 })
    polling = false
    await poll

    expect(sawNeither).toBe(false)
    expect(sawSubmitAfterClick).toBe(false)
  })
})
