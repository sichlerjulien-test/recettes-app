// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// jsdom n'implémente pas ResizeObserver (utilisé par @radix-ui/react-use-size)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { EditSejourClient } from '@/app/sejour/[id]/edit/_components/EditSejourClient'
import type { Sejour } from '@/lib/types/domain'

// ─── Mocks hissés ────────────────────────────────────────────────────────────

const mockRouterPush = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// ─── Fixture ─────────────────────────────────────────────────────────────────

const TOKEN = 'tok-test-xyz'
const SEJOUR_ID = 'sejour-001'

const SEJOUR: Sejour = {
  id: SEJOUR_ID,
  token: TOKEN,
  nom: 'Chalet été',
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 3, soirs: 3, brunchs: 0 },
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['plaque'],
    temps_disponible: 'standard',
  },
  participants: [
    { id: 'p-001', nom: 'Alice', allergies: [], exclusions: [], aime: [], n_aime_pas: [] },
  ],
  cree_le: '2026-06-01T00:00:00Z',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFetch(...responses: { ok: boolean; status?: number; body?: unknown }[]) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body ?? {},
    })
  }
  return fn
}

function renderClient(hasPlanning: boolean) {
  return render(
    <EditSejourClient sejour={SEJOUR} token={TOKEN} hasPlanning={hasPlanning} />,
  )
}

async function submitFormAndWaitForModal(container: HTMLElement) {
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(screen.queryAllByRole('dialog').length).toBeGreaterThan(0))
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EditSejourClient — wiring régénération', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('hasPlanning=true → modale après PATCH, aucun POST avant confirmation', async () => {
    fetchMock = buildFetch({ ok: true }, { ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    const { container } = renderClient(true)

    expect(screen.queryByRole('dialog')).toBeNull()

    // Ajouter un participant "Bob" avec exclusion végétarien
    fireEvent.click(screen.getByText('Ajouter un participant'))

    const nomInputs = screen.getAllByLabelText('Nom')
    fireEvent.change(nomInputs[1]!, { target: { value: 'Bob' } })

    const vegetarienBtns = screen.getAllByText('Végétarien')
    fireEvent.click(vegetarienBtns[1]!) // bouton participant 2

    // Soumettre (bypass button disabled via submit event natif)
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull())

    // POST planning non encore appelé
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Vérifier le payload PATCH
    const [patchUrl, patchInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(patchUrl).toContain(`/api/sejours/${SEJOUR_ID}`)
    expect(patchInit.method).toBe('PATCH')
    expect((patchInit.headers as Record<string, string>)['X-Sejour-Token']).toBe(TOKEN)
    const body = JSON.parse(patchInit.body as string)
    expect(body.participants).toHaveLength(2)
    expect(body.participants[1].nom).toBe('Bob')
    expect(body.participants[1].exclusions).toContain('vegetarien')
  })

  it('clic Régénérer → PATCH puis POST, ordre respecté, header X-Sejour-Token présent', async () => {
    fetchMock = buildFetch({ ok: true }, { ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    const { container } = renderClient(true)

    await submitFormAndWaitForModal(container)

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const calls = fetchMock.mock.calls as [string, RequestInit][]
    const [patchUrl, patchInit] = calls[0]!
    const [postUrl, postInit] = calls[1]!

    expect(patchInit.method).toBe('PATCH')
    expect(patchUrl).toContain(`/api/sejours/${SEJOUR_ID}`)
    expect((patchInit.headers as Record<string, string>)['X-Sejour-Token']).toBe(TOKEN)

    expect(postInit.method).toBe('POST')
    expect(postUrl).toContain(`/api/sejours/${SEJOUR_ID}/planning`)
    expect((postInit.headers as Record<string, string>)['X-Sejour-Token']).toBe(TOKEN)
  })

  it('POST 200 → bannière pool-empty absente', async () => {
    fetchMock = buildFetch({ ok: true }, { ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    const { container } = renderClient(true)

    await submitFormAndWaitForModal(container)
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(screen.queryByTestId('pool-empty-banner')).toBeNull()
  })

  it('(bonus) POST 422 pool_empty → bannière présente, pas de redirection', async () => {
    fetchMock = buildFetch(
      { ok: true },
      {
        ok: false,
        status: 422,
        body: { error: { kind: 'pool_empty', message: 'Aucune recette disponible' } },
      },
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const { container } = renderClient(true)

    await submitFormAndWaitForModal(container)
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))

    await waitFor(() =>
      expect(screen.queryByTestId('pool-empty-banner')).not.toBeNull(),
    )

    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})
