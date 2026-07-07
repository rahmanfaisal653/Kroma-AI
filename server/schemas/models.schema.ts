import { z } from 'zod';

export const createModelSchema = z.object({
  name: z.string().min(1, 'Model name is required'),
  type: z.enum(['text-to-text', 'text-to-image', 'text-to-video', 'text-to-audio']),
  description: z.string().optional().default(''),
  endpoint: z.string().min(1, 'Endpoint is required'),
  target_url: z.string().url('Target URL must be a valid URL'),
  target_auth: z.string().optional().default(''),
  price_per_token: z.number().min(0).optional().default(10),
  price_input: z.number().min(0).optional().default(0),
  price_output: z.number().min(0).optional().default(0),
  model_slug: z.string().optional().default(''),
  default_temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().positive().optional().default(1024),
  is_streaming: z.boolean().optional().default(false),
  timeout_ms: z.number().int().positive().optional().default(120000),
  max_input_chars: z.number().int().positive().optional().default(8000),
  speed_mode: z.string().optional().default('balanced'),
  features: z.array(z.string()).optional().default([]),
  versions: z.array(z.string()).optional().default(['v1.0.0']),
  active: z.union([z.boolean(), z.number()]).optional().default(true),
}).passthrough(); // Allow extra fields for forward compat

export const updateModelSchema = createModelSchema.partial().passthrough();
