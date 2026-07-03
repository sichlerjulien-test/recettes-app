// @vitest-environment jsdom
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { PlanningSection } from './PlanningSection';
import type { Recette, Ingredient } from '@/lib/types/domain';
import type { PlanningState } from '@/lib/planning/resolve-planning-state';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RECETTE: Recette = {
  id: 'chili-con-carne',
  nom: 'Chili con carne',
  description: 'Un chili généreux.',
  portions_base: 4,
  duree_minutes: 60,
  duree_active: 20,
  difficulte: 'facile',
  equipement: ['plaque'],
  type_repas: ['soir'],
  type_cuisine: 'americaine',
  saison: ['hiver'],
  ingredient_principal: 'boeuf',
  feculent_dominant: 'aucun',
  ingredients: [
    { ingredient_id: 'oignon', quantite_base: 2, unite: 'piece', optionnel: false },
    { ingredient_id: 'boeuf-hache', quantite_base: 400, unite: 'g', optionnel: false },
    { ingredient_id: 'cumin-moulu', quantite_base: 2, unite: 'cuillere-soupe', optionnel: false },
  ],
  etapes: [
    "Faire revenir l'oignon.",
    'Ajouter le bœuf haché.',
  ],
  tags_libres: [],
  allergenes_calcules: [],
  exclusions_compatibles: [],
};

const OIGNON: Ingredient = {
  id: 'oignon',
  nom_singulier: 'Oignon',
  nom_pluriel: 'Oignons',
  categorie: 'fruits-legumes',
  unite_base: 'piece',
  unite_achat: 'piece',
  conversion: 100,
  allergenes: [],
  contient_trace: [],
  substituts: [],
  exclusion_tags: [],
};

const BOEUF: Ingredient = {
  id: 'boeuf-hache',
  nom_singulier: 'Bœuf haché',
  nom_pluriel: 'Bœuf haché',
  categorie: 'viandes-poissons',
  unite_base: 'g',
  unite_achat: 'piece',
  conversion: 100,
  allergenes: [],
  contient_trace: [],
  substituts: [],
  exclusion_tags: [],
};

const CUMIN: Ingredient = {
  id: 'cumin-moulu',
  nom_singulier: 'Cumin moulu',
  nom_pluriel: 'Cumin moulu',
  categorie: 'condiments-epices',
  unite_base: 'g',
  unite_achat: 'sachet',
  conversion: 5,
  allergenes: [],
  contient_trace: [],
  substituts: [],
  exclusion_tags: [],
};

const RECETTES = new Map<string, Recette>([['chili-con-carne', RECETTE]]);
const INGREDIENTS = new Map<string, Ingredient>([
  ['oignon', OIGNON],
  ['boeuf-hache', BOEUF],
  ['cumin-moulu', CUMIN],
]);

const PLANNING_STATE: PlanningState = {
  status: 'ok',
  planning: {
    id: 'plan-1',
    sejour_id: 'sejour-1',
    genere_le: '2026-01-01T00:00:00Z',
    contraintes_utilisees: { allergenes: [], exclusions: [], equipement: [] },
    entries: [
      {
        kind: 'recette' as const,
        jour: 1,
        repas: 'soir',
        recette_id: 'chili-con-carne',
        portions: 6,
      },
    ],
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

function mealButton() {
  return screen.getByRole('button', { name: /Chili con carne/ });
}

describe('PlanningSection — TK-38 dépliage recette', () => {
  afterEach(() => cleanup());
  it('affiche le nom de la recette', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    expect(screen.getByText('Chili con carne')).toBeDefined();
  });

  it('repas replié par défaut — étapes non visibles', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    expect(screen.queryByText("Faire revenir l'oignon.")).toBeNull();
  });

  it('clic sur le repas → étape visible', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    expect(screen.getByText("Faire revenir l'oignon.")).toBeDefined();
    expect(screen.getByText('Ajouter le bœuf haché.')).toBeDefined();
  });

  it('ingrédient discret — pluriel (2 oignons mis à échelle 6 pers base 4 → 3 Oignons)', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    // 2 * (6/4) = 3 → "3 Oignons"
    expect(screen.getByText('3 Oignons')).toBeDefined();
  });

  it('ingrédient continu — grammes mis à échelle (400g base 4 → 600g pour 6 pers)', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    expect(screen.getByText('600g de Bœuf haché')).toBeDefined();
  });

  it('anti-piège cuillere-soupe — affiché sans conversion en ml/litres', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    // 2 * (6/4) = 3 → "3c. à soupe de Cumin moulu"
    const line = screen.getByText('3c. à soupe de Cumin moulu');
    expect(line).toBeDefined();
  });

  it('slug brut absent du DOM après dépliage', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    expect(screen.queryByText('oignon')).toBeNull();
    expect(screen.queryByText('boeuf-hache')).toBeNull();
    expect(screen.queryByText('cumin-moulu')).toBeNull();
  });

  it('étapes — ordre dans le DOM (liste ordonnée, séquence préservée)', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    const ol = screen.getAllByRole('list').find(el => el.tagName.toLowerCase() === 'ol')!;
    const [first, second] = within(ol).getAllByRole('listitem');
    expect(first?.textContent).toBe("Faire revenir l'oignon.");
    expect(second?.textContent).toBe('Ajouter le bœuf haché.');
  });

  it('second clic referme le panneau', () => {
    render(<PlanningSection planningState={PLANNING_STATE} recettes={RECETTES} ingredients={INGREDIENTS} sejourId="sejour-test" token="tok-test" />);
    fireEvent.click(mealButton());
    expect(screen.getByText("Faire revenir l'oignon.")).toBeDefined();
    fireEvent.click(mealButton());
    expect(screen.queryByText("Faire revenir l'oignon.")).toBeNull();
  });
});
