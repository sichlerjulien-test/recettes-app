import type { z } from 'zod';
import type {
  GeneratePlanningInputSchema,
  GeneratePlanningOutputSchema,
  LLMErrorSchema,
} from '../types/schemas';

export type GeneratePlanningInput = z.infer<typeof GeneratePlanningInputSchema>;
export type GeneratePlanningOutput = z.infer<typeof GeneratePlanningOutputSchema>;
export type LLMError = z.infer<typeof LLMErrorSchema>;
