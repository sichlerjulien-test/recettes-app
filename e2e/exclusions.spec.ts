import { test, expect } from '@playwright/test'

// Mocks all API calls so the tests run without a real DB or LLM.
// The dietary filter logic is proven by unit tests (filter.test.ts).
// These tests prove: (1) UI sends correct exclusions, (2) presets accessible en un tap,
// (3) pool_empty mène à la page d'édition, (4) défaut vide = pas de bruit UI.

type SejourPayload = { participants?: Array<{ exclusions: string[] }> }

test.describe('TK-05 — Exclusions alimentaires UI', () => {

  test('vegetarien (un tap) + sans-viande-rouge → exclusions transmises à l\'API', async ({ page }) => {
    const captured: SejourPayload[] = []

    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        captured.push(route.request().postDataJSON() as SejourPayload)
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'e2e-id', token: 'e2e-token' }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/sejours/e2e-id/planning', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/nouveau-sejour')

    // Participant 1 : Alice — Végétarien en un tap (preset direct, pas d'atomiques)
    await page.getByLabel('Nom').first().fill('Alice')
    const vegetarienBtn = page.getByRole('button', { name: 'Végétarien' }).first()
    await expect(vegetarienBtn).toBeVisible()
    await vegetarienBtn.click()
    await expect(vegetarienBtn).toHaveClass(/bg-gray-100/)

    // Ajouter participant 2
    await page.getByRole('button', { name: 'Ajouter un participant' }).click()

    // Participant 2 : Bob — sans viande rouge en un tap (atomique direct, pas de menu)
    await page.getByLabel('Nom').nth(1).fill('Bob')
    const sansViandeBtn = page.getByRole('button', { name: 'Sans viande rouge' }).nth(1)
    await expect(sansViandeBtn).toBeVisible()
    await sansViandeBtn.click()
    await expect(sansViandeBtn).toHaveClass(/bg-gray-100/)

    // Soumettre
    await page.getByRole('button', { name: /Créer et générer/ }).click()

    // Attendre que la requête séjour soit émise
    await page.waitForURL(/\/sejour\//, { timeout: 5000 }).catch(() => {})

    // Critère d'acceptation TK-05 : les exclusions correctes sont transmises à l'API
    expect(captured).toHaveLength(1)
    expect(captured[0]!.participants?.[0]?.exclusions).toContain('vegetarien')
    expect(captured[0]!.participants?.[1]?.exclusions).toContain('sans-viande-rouge')
  })

  test('séjour sans exclusion — aucun bruit UI, soumission normale', async ({ page }) => {
    const captured: SejourPayload[] = []

    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        captured.push(route.request().postDataJSON() as SejourPayload)
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'e2e-noxcl', token: 'e2e-token' }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/sejours/e2e-noxcl/planning', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/nouveau-sejour')

    // Section préférences visible mais aucun bouton sélectionné par défaut
    await expect(page.getByText('Préférences alimentaires').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Végétarien' }).first()).toHaveClass(/border-gray-200/)
    await expect(page.getByRole('button', { name: 'Vegan' }).first()).toHaveClass(/border-gray-200/)

    // Remplir le formulaire sans sélectionner d'exclusions
    await page.getByLabel('Nom').first().fill('Alice')

    await page.getByRole('button', { name: /Créer et générer/ }).click()
    await page.waitForURL(/\/sejour\//, { timeout: 5000 }).catch(() => {})

    // Vérifier qu'aucune exclusion n'est transmise
    expect(captured).toHaveLength(1)
    expect(captured[0]!.participants?.[0]?.exclusions).toEqual([])
  })

  test('pool_empty → message actionnable et redirection vers édition', async ({ page }) => {
    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'pool-empty-id', token: 'pool-token' }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/sejours/pool-empty-id/planning', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            kind: 'pool_empty',
            message: "Aucune recette ne correspond à ces exclusions. Essayez d'en retirer une.",
          },
        }),
      })
    })

    await page.goto('/nouveau-sejour')
    await page.getByLabel('Nom').first().fill('Alice')
    await page.getByRole('button', { name: 'Vegan' }).first().click()

    await page.getByRole('button', { name: /Créer et générer/ }).click()

    // Doit rediriger vers /edit (pas la page de visualisation sans planning)
    await page.waitForURL(/\/sejour\/pool-empty-id\/edit/, { timeout: 5000 }).catch(() => {})
    await expect(page).toHaveURL(/\/edit/)
  })

  test('distinction visuelle : exclusions ≠ allergènes', async ({ page }) => {
    await page.goto('/nouveau-sejour')

    // Les deux sections sont bien présentes et séparées
    await expect(page.getByText('Allergies').first()).toBeVisible()
    await expect(page.getByText('Préférences alimentaires').first()).toBeVisible()

    // Sélectionner un allergène (variant primary → bg-primary)
    const glutenBtn = page.getByRole('button', { name: 'Gluten' }).first()
    await glutenBtn.click()

    // Sélectionner une exclusion (style neutre → bg-gray-100)
    const vegetarienBtn = page.getByRole('button', { name: 'Végétarien' }).first()
    await vegetarienBtn.click()

    // L'exclusion sélectionnée a le style neutre
    await expect(vegetarienBtn).toHaveClass(/bg-gray-100/)
    // L'allergène sélectionné n'a PAS le style neutre exclusion
    await expect(glutenBtn).not.toHaveClass(/bg-gray-100/)
  })

})
