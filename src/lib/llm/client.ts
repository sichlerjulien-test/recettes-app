/**
 * Adaptateur API Anthropic.
 *
 * NON TESTÉ unitairement par design : ce module est un wrapper fin autour
 * du SDK officiel @anthropic-ai/sdk. Sa logique métier est minimale
 * (construction du prompt, parse Zod du tool_use, gestion d'erreur).
 *
 * Validation effective via :
 * - Tests d'intégration appelant l'API réelle (cf. integration.test.ts)
 * - Tests de generatePlanning() qui mockent ce client via l'interface LLMClient
 *
 * Si la complexité de buildSystemPrompt ou buildUserMessage augmente,
 * extraire ces fonctions dans un module testable séparé.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { LLMPlanningOutputSchema } from '../types/schemas';
import { buildSequence } from '../planning/build-sequence';
import type { GeneratePlanningInput, GeneratePlanningOutput } from './types';

/** Abstraction du client LLM — injectable pour les tests. */
export interface LLMClient {
  generate(input: GeneratePlanningInput): Promise<GeneratePlanningOutput>;
}

/** Dérive le input_schema depuis LLMPlanningOutputSchema — source unique (TK-24). */
export function buildComposePlanningToolInputSchema(): Anthropic.Tool['input_schema'] {
  const { $schema: _$schema, ...schema } = z.toJSONSchema(LLMPlanningOutputSchema, { reused: 'inline' });
  // ZodStandardJSONSchemaPayload n'est pas structurellement assignable à Tool['input_schema'] ;
  // le cast est sûr car LLMPlanningOutputSchema est un z.object() → type:'object' garanti.
  return schema as unknown as Anthropic.Tool['input_schema'];
}

export const COMPOSE_PLANNING_TOOL = {
  name: 'compose_planning',
  description: 'Compose un planning de repas à partir du pool fourni',
  input_schema: buildComposePlanningToolInputSchema(),
} satisfies Anthropic.Tool;

function buildSystemPrompt(totalRepas: number): string {
  return `Tu es un assistant spécialisé dans la composition de plannings de repas pour des séjours en groupe.

Règles à respecter impérativement :
- Choisir UNIQUEMENT des recettes présentes dans le pool fourni, identifiées par leur recette_id exact
- Ne jamais utiliser la même recette deux fois
- Varier les protéines principales : éviter le même ingredient_principal deux fois dans la même journée
- Varier les types de cuisine sur l'ensemble du planning
- Si temps_disponible est "rapide", privilégier les recettes avec une duree_active courte
- Équilibrer les féculents (feculent_dominant) sur l'ensemble du séjour
- Adapter les choix au niveau_cuisine (facile ou normal)

Tu dois appeler l'outil compose_planning avec exactement ${totalRepas} entrées couvrant tous les créneaux listés.`;
}

function buildUserMessage(input: GeneratePlanningInput): string {
  const { pool, contexte } = input;
  const { nb_jours, repartition_repas, niveau_cuisine, temps_disponible } = contexte;

  const slots = buildSequence(repartition_repas);
  const slotsLines = slots.map((s) => `- Jour ${s.jour}, ${s.repas}`).join('\n');

  const poolLines = pool
    .map(
      (r) =>
        `- id:${r.id} | nom:${r.nom} | type_repas:${r.type_repas.join('/')} | cuisine:${r.type_cuisine} | proteine:${r.ingredient_principal} | feculent:${r.feculent_dominant} | duree_active:${r.duree_active}min`,
    )
    .join('\n');

  return `Contexte du séjour :
- Durée : ${nb_jours} jours
- Créneaux à remplir dans cet ordre :
${slotsLines}
- Niveau cuisine : ${niveau_cuisine}
- Temps disponible : ${temps_disponible}

Pool disponible (${pool.length} recettes) :
${poolLines}

Compose le planning complet en appelant l'outil compose_planning. Remplis exactement les ${slots.length} créneaux listés ci-dessus, dans le même ordre (même jour et même repas).`;
}

/**
 * Crée un client LLM Anthropic concret.
 *
 * Le client gère un timeout de 15s et un retry réseau automatique (1 fois).
 * Il ne reçoit jamais d'informations sur les allergies des participants.
 */
export function createAnthropicClient(apiKey: string): LLMClient {
  const anthropic = new Anthropic({
    apiKey,
    maxRetries: 1,
  });

  return {
    async generate(input: GeneratePlanningInput): Promise<GeneratePlanningOutput> {
      const slots = buildSequence(input.contexte.repartition_repas);
      const totalRepas = slots.length;

      const response = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: buildSystemPrompt(totalRepas),
          messages: [{ role: 'user', content: buildUserMessage(input) }],
          tools: [COMPOSE_PLANNING_TOOL],
          tool_choice: { type: 'tool', name: 'compose_planning' },
        },
        { timeout: 15000 },
      );

      const toolBlock = response.content.find((b) => b.type === 'tool_use');

      if (toolBlock === undefined || toolBlock.type !== 'tool_use') {
        throw new Error('Réponse LLM sans appel outil compose_planning');
      }

      const parsed = LLMPlanningOutputSchema.parse(toolBlock.input);

      return {
        entries: parsed.planning.map((entry) => ({
          jour: entry.jour,
          repas: entry.repas,
          recette_id: entry.recette_id,
        })),
      };
    },
  };
}
