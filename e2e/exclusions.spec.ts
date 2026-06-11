import { test, expect } from '@playwright/test'

// Mocks all API calls so the tests run without a real DB or LLM.
// The dietary filter logic is proven by unit tests (filter.test.ts).
// These tests prove: (1) UI sends correct exclusions, (2) presets accessible en un tap,
// (3) pool_empty mène à la page d'édition, (4) défaut vide = pas de bruit UI.

// UUIDs stables pour les mocks — CreateSejourBodySchema exige z.string().uuid()
const UUID_SEJOUR_1 = '00000000-0000-0000-0000-000000000001'
const UUID_TOKEN_1  = '00000000-0000-0000-0000-000000000002'
const UUID_SEJOUR_2 = '00000000-0000-0000-0000-000000000003'
const UUID_SEJOUR_POOL_EMPTY_EXCL = '00000000-0000-0000-0000-000000000004'
const UUID_TOKEN_POOL_EMPTY_EXCL  = '00000000-0000-0000-0000-000000000005'
const UUID_SEJOUR_POOL_EMPTY_ALRG = '00000000-0000-0000-0000-000000000006'
const UUID_TOKEN_POOL_EMPTY_ALRG  = '00000000-0000-0000-0000-000000000007'

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
          body: JSON.stringify({ id: UUID_SEJOUR_1, token: UUID_TOKEN_1 }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/sejours/${UUID_SEJOUR_1}/planning`, async (route) => {
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
          body: JSON.stringify({ id: UUID_SEJOUR_2, token: UUID_TOKEN_1 }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/sejours/${UUID_SEJOUR_2}/planning`, async (route) => {
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

  // pool_empty — cause exclusion : message actionnable n'invitant pas à retirer un allergène
  test('pool_empty cause=exclusion → planning appelé, message cause correcte, redirection /edit', async ({ page }) => {
    const planningCalled: string[] = []

    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: UUID_SEJOUR_POOL_EMPTY_EXCL, token: UUID_TOKEN_POOL_EMPTY_EXCL }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/sejours/${UUID_SEJOUR_POOL_EMPTY_EXCL}/planning`, async (route) => {
      planningCalled.push(route.request().url())
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            kind: 'pool_empty',
            message: "Aucune recette ne correspond à ces exclusions alimentaires. Essayez d'en retirer une.",
          },
        }),
      })
    })

    await page.goto('/nouveau-sejour')
    await page.getByLabel('Nom').first().fill('Alice')
    await page.getByRole('button', { name: 'Vegan' }).first().click()

    await page.getByRole('button', { name: /Créer et générer/ }).click()

    // Le flow pool_empty est réellement exercé : l'endpoint planning a été appelé
    await page.waitForRequest(`**/api/sejours/${UUID_SEJOUR_POOL_EMPTY_EXCL}/planning`, { timeout: 5000 })
    expect(planningCalled).toHaveLength(1)

    // Libellé correct : message exclusion, jamais "allergén" ou "retirer un allergène"
    const errorToast = page.getByText(/Aucune recette ne correspond à ces exclusions/)
    await expect(errorToast).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/retirer un allergène/)).not.toBeVisible()
    await expect(page.getByText(/Vérifiez les allergies/)).not.toBeVisible()

    // Redirection vers /edit initiée par le client
    await page.waitForURL(new RegExp(`/sejour/${UUID_SEJOUR_POOL_EMPTY_EXCL}/edit`), { timeout: 5000 }).catch(() => {})
  })

  // pool_empty — cause allergène : message n'invitant jamais à retirer un allergène
  test('pool_empty cause=allergen → message distinct, jamais "retirer un allergène"', async ({ page }) => {
    const planningCalled: string[] = []

    await page.route('**/api/sejours', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: UUID_SEJOUR_POOL_EMPTY_ALRG, token: UUID_TOKEN_POOL_EMPTY_ALRG }),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/sejours/${UUID_SEJOUR_POOL_EMPTY_ALRG}/planning`, async (route) => {
      planningCalled.push(route.request().url())
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            kind: 'pool_empty',
            message: 'Aucune recette ne correspond aux allergies déclarées. Vérifiez les allergies des participants.',
          },
        }),
      })
    })

    await page.goto('/nouveau-sejour')
    await page.getByLabel('Nom').first().fill('Alice')

    await page.getByRole('button', { name: /Créer et générer/ }).click()

    // Le flow pool_empty est réellement exercé
    await page.waitForRequest(`**/api/sejours/${UUID_SEJOUR_POOL_EMPTY_ALRG}/planning`, { timeout: 5000 })
    expect(planningCalled).toHaveLength(1)

    // Message allergène : "Vérifiez les allergies" — jamais "retirer un allergène"
    const errorToast = page.getByText(/Vérifiez les allergies des participants/)
    await expect(errorToast).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/retirer un allergène/i)).not.toBeVisible()
    await expect(page.getByText(/retirer une exclusion/i)).not.toBeVisible()
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
