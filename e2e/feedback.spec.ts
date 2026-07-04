import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// E2E contre dev DB seedée (TK-43).
// Limite connue : la page séjour est un Server Component non interceptable
// par page.route — ce test tape la vraie dev DB (cf. note TK-38).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function getAdminClient() {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Fixtures DB ──────────────────────────────────────────────────────────────

const TEST_TOKEN = 'e2e-feedback-token-tk43';

const PLANNING_ENTRIES = [
  { kind: 'recette', jour: 1, repas: 'midi',  recette_id: 'poulet-basquaise', portions: 4 },
  { kind: 'recette', jour: 1, repas: 'soir',  recette_id: 'omelette-fromage', portions: 4 },
  { kind: 'resto',   jour: 2, repas: 'midi' },
];

const CONTRAINTES = { allergenes: [], exclusions: [], equipement: ['plaque'] };

async function seedTestData() {
  const sb = getAdminClient();

  // Créer un séjour de test
  const { data: sejour, error: sejourErr } = await sb
    .from('sejours')
    .insert({
      token: TEST_TOKEN,
      nom: 'Séjour E2E TK-43',
      nb_jours: 2,
      repartition_repas: { premier_repas: 'midi', midis: 2, soirs: 2, brunchs: 0, slots_resto: [{ jour: 2, repas: 'midi' }] },
      parametres: { niveau_cuisine: 'facile', equipement_disponible: ['plaque'], temps_disponible: 'standard' },
    })
    .select()
    .single();

  if (sejourErr || !sejour) throw new Error(`Seed sejour: ${sejourErr?.message}`);

  // Créer un planning
  const { data: planning, error: planningErr } = await sb
    .from('plannings')
    .insert({
      sejour_id: sejour.id,
      entries: PLANNING_ENTRIES,
      contraintes_utilisees: CONTRAINTES,
    })
    .select()
    .single();

  if (planningErr || !planning) throw new Error(`Seed planning: ${planningErr?.message}`);

  return { sejourId: sejour.id as string, planningId: planning.id as string };
}

async function cleanupTestData(sejourId: string) {
  const sb = getAdminClient();
  await sb.from('feedback').delete().eq('sejour_id', sejourId);
  await sb.from('plannings').delete().eq('sejour_id', sejourId);
  await sb.from('sejours').delete().eq('id', sejourId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('TK-43 — Feedback pouce bas', () => {
  let sejourId: string;
  let planningId: string;

  test.beforeAll(async () => {
    if (!supabaseUrl || !serviceKey) {
      test.skip();
    }
    const ids = await seedTestData();
    sejourId = ids.sejourId;
    planningId = ids.planningId;
  });

  test.afterAll(async () => {
    if (sejourId) await cleanupTestData(sejourId);
  });

  test('tap pouce bas → état noté en UI + ligne en base avec le bon recette_id', async ({ page }) => {
    // Navigation vers la page séjour avec le token
    await page.goto(`/sejour/${sejourId}?t=${TEST_TOKEN}`);

    // Vérifier que la page a chargé (présence d'un repas)
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 10000 });

    // Trouver le bouton pouce bas du premier repas cuisiné (jour 1, midi)
    const dislikeBtn = page.getByRole('button', { name: 'Ce repas ne me convient pas' }).first();
    await expect(dislikeBtn).toBeVisible();

    // Tap pouce bas
    await dislikeBtn.click();

    // Vérifier l'état "noté" en UI (optimiste : ✓ visible)
    const doneIndicator = page.getByLabel('Avis enregistré').first();
    await expect(doneIndicator).toBeVisible({ timeout: 5000 });

    // Vérifier la ligne en base
    const sb = getAdminClient();
    const { data: rows } = await sb
      .from('feedback')
      .select('*')
      .eq('sejour_id', sejourId)
      .eq('planning_id', planningId)
      .eq('jour', 1)
      .eq('repas', 'midi');

    expect(rows).toHaveLength(1);
    expect(rows![0].recette_id).toBe('poulet-basquaise');
  });

  test('les créneaux resto/non-cuisiné n\'ont pas de bouton pouce bas', async ({ page }) => {
    await page.goto(`/sejour/${sejourId}?t=${TEST_TOKEN}`);
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 10000 });

    // Le créneau "Resto / non cuisiné" (jour 2, midi) ne doit pas avoir de bouton pouce bas
    const restoSection = page.getByText('Resto / non cuisiné').first();
    await expect(restoSection).toBeVisible();

    // Vérifier qu'il n'y a pas de bouton pouce bas adjacent au créneau resto
    const restoLi = restoSection.locator('xpath=ancestor::li[1]');
    await expect(
      restoLi.getByRole('button', { name: 'Ce repas ne me convient pas' }),
    ).not.toBeVisible();
  });
});
