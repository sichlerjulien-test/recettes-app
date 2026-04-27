import Anthropic from '@anthropic-ai/sdk';
import { LLMPlanningOutputSchema } from '../types/schemas';
import type { GeneratePlanningInput, GeneratePlanningOutput } from './types';

/** Abstraction du client LLM — injectable pour les tests. */
export interface LLMClient {
  generate(input: GeneratePlanningInput): Promise<GeneratePlanningOutput>;
}

const COMPOSE_PLANNING_TOOL = {
  name: 'compose_planning',
  description: 'Compose un planning de repas à partir du pool fourni',
  input_schema: {
    type: 'object' as const,
    properties: {
      planning: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            jour: { type: 'integer', minimum: 1 },
            repas: { type: 'string', enum: ['midi', 'soir', 'brunch'] },
            recette_id: { type: 'string' },
          },
          required: ['jour', 'repas', 'recette_id'],
          additionalProperties: false,
        },
        minItems: 1,
      },
    },
    required: ['planning'],
    additionalProperties: false,
  },
} satisfies Anthropic.Tool;

function buildSystemPrompt(totalRepas: number): string {
  return `Tu es un assistant spécialisé dans la composition de plannings de repas pour des séjours en groupe.

Règles à respecter impérativement :
- Choisir UNIQUEMENT des recettes présentes dans le pool fourni, identifiées par leur recette_id exact
- Ne jamais utiliser la même recette deux fois
- Varier les protéines principales : éviter deux ingredient_principal identiques sur la même journée (24h)
- Varier les types de cuisine sur l'ensemble du planning
- Si temps_disponible est "rapide", privilégier les recettes avec une duree_active courte
- Équilibrer les féculents (feculent_dominant) sur l'ensemble du séjour
- Adapter les choix au niveau_cuisine (facile ou normal)

Tu dois appeler l'outil compose_planning avec exactement ${totalRepas} entrées couvrant tous les repas du séjour.`;
}

function buildUserMessage(input: GeneratePlanningInput): string {
  const { pool, contexte } = input;
  const { nb_jours, repartition_repas, niveau_cuisine, temps_disponible } = contexte;

  const poolLines = pool
    .map(
      (r) =>
        `- id:${r.id} | nom:${r.nom} | type_repas:${r.type_repas.join('/')} | cuisine:${r.type_cuisine} | proteine:${r.ingredient_principal} | feculent:${r.feculent_dominant} | duree_active:${r.duree_active}min`,
    )
    .join('\n');

  return `Contexte du séjour :
- Durée : ${nb_jours} jours
- Répartition : ${repartition_repas.midis} midis, ${repartition_repas.soirs} soirs, ${repartition_repas.brunchs} brunchs
- Niveau cuisine : ${niveau_cuisine}
- Temps disponible : ${temps_disponible}

Pool disponible (${pool.length} recettes) :
${poolLines}

Compose le planning complet en appelant l'outil compose_planning.`;
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
      const { repartition_repas } = input.contexte;
      const totalRepas =
        repartition_repas.midis + repartition_repas.soirs + repartition_repas.brunchs;

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
