// @vitest-environment jsdom
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { EditSejourClient } from './EditSejourClient';
import type { Sejour } from '@/lib/types/domain';

const SEJOUR: Sejour = {
  id: 'sejour-uuid-123',
  token: 'token-abc',
  nom: 'Séjour test',
  nb_jours: 3,
  repartition_repas: { premier_repas: 'matin', midis: 2, soirs: 2, brunchs: 0, slots_resto: [] },
  participants: [],
  parametres: {
    niveau_cuisine: 'facile',
    equipement_disponible: ['plaque'],
    temps_disponible: 'standard',
  },
  cree_le: '2026-04-28T00:00:00.000Z',
};

describe('EditSejourClient — suppression', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ouvre une confirmation avant de supprimer, puis appelle DELETE avec le token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EditSejourClient sejour={SEJOUR} token="token-abc" hasPlanning={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le séjour' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sejours/sejour-uuid-123',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'X-Sejour-Token': 'token-abc' },
        }),
      );
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });

  it("n'appelle pas DELETE quand on annule la confirmation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<EditSejourClient sejour={SEJOUR} token="token-abc" hasPlanning={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le séjour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
