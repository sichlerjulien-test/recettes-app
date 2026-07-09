// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SejourForm } from '@/components/sejour-form'

describe('SejourForm — marquage resto (TK-71)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function setCounts(container: HTMLElement, midis: string, soirs: string, brunchs = '0') {
    void container
    fireEvent.change(screen.getByRole('textbox', { name: 'Midi' }), { target: { value: midis } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Soir' }), { target: { value: soirs } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Petit-déjeuner' }), {
      target: { value: brunchs },
    })
  }

  it('CA-1 : chaque créneau dérivé de buildSequence est togglable, défaut = cuisiné', () => {
    const { container } = render(<SejourForm onSubmit={vi.fn()} />)

    setCounts(container, '2', '2')

    // 2 midis + 2 soirs sur les défauts (2 jours, premier repas matin) → jour 1 midi/soir, jour 2 midi/soir
    const restoButtons = screen.getAllByRole('button', { name: /Midi|Soir/ })
    expect(restoButtons.length).toBeGreaterThanOrEqual(4)
    // Défaut = non-resto : aucun bouton en variant "default" (actif)
    for (const btn of restoButtons) {
      expect(btn.className).not.toContain('bg-primary')
    }
  })

  it('CA-2 : toggler jour 1 soir produit {jour:1, repas:"soir"} dans le payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<SejourForm onSubmit={onSubmit} />)

    setCounts(container, '0', '2')
    // premier_repas défaut = matin → séquence : jour1 soir, jour2 soir (midis=0, brunchs=0)

    const soirButtons = screen.getAllByRole('button', { name: 'Soir' })
    fireEvent.click(soirButtons[0]!)

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Alice' } })
    fireEvent.submit(container.querySelector('form')!)

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const data = onSubmit.mock.calls[0]![0]
    expect(data.repartition_repas.slots_resto).toEqual([{ jour: 1, repas: 'soir' }])
  })

  it('CA-3 : réduire soirs après avoir coché purge le slot resto orphelin', () => {
    const { container } = render(<SejourForm onSubmit={vi.fn()} />)

    setCounts(container, '0', '2')
    const soirButtons = screen.getAllByRole('button', { name: 'Soir' })
    fireEvent.click(soirButtons[0]!) // jour 1 soir → resto

    expect(screen.getAllByRole('button', { name: 'Soir' })[0]!.className).toContain('bg-primary')

    setCounts(container, '0', '0')

    // Plus aucun créneau planifié → plus de bouton resto affiché
    expect(screen.queryAllByRole('button', { name: 'Soir' })).toHaveLength(0)

    // Ré-augmenter à 2 soirs : le slot jour 1 soir ne doit plus être marqué resto (purgé)
    setCounts(container, '0', '2')
    expect(screen.getAllByRole('button', { name: 'Soir' })[0]!.className).not.toContain('bg-primary')
  })

  it('CA-4 : un séjour tout-resto reste soumettable (pas de warning de couverture)', () => {
    const { container } = render(<SejourForm onSubmit={vi.fn()} />)

    setCounts(container, '0', '3') // 3 jours * 3 repas max par défaut nb_jours=2 → couvre min

    // Marquer tous les slots en resto ne doit pas faire apparaître d'alerte liée aux resto
    const soirButtons = screen.getAllByRole('button', { name: 'Soir' })
    soirButtons.forEach((btn) => fireEvent.click(btn))

    // La validation de couverture reste indépendante du marquage resto (basée sur les comptes)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
