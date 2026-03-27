import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { PartyStatus } from '../../firebase/models/signup.model.js';

const ProgPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  partyStatus: z.enum(
    Object.values(PartyStatus) as [PartyStatus, ...PartyStatus[]],
  ),
});

export const EncounterConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Z_]+$/, 'id must be uppercase letters and underscores only'),
  name: z.string().min(1),
  description: z.string().min(1),
  mode: z.enum(['legacy', 'ultimate', 'savage']),
  emoji: z.string().optional(),
  fflogsEncounterIds: z.array(z.number().int().positive()).optional(),
  progPoints: z.array(ProgPointSchema).optional(),
  progPartyThreshold: z.string().optional(),
  clearPartyThreshold: z.string().optional(),
});

export type EncounterConfig = z.infer<typeof EncounterConfigSchema>;

export function loadEncounterConfig(filePath: string): EncounterConfig {
  const ext = extname(filePath).toLowerCase();
  const raw = readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.load(raw);
  } else if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else {
    throw new Error(
      `Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`,
    );
  }

  const result = EncounterConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid encounter config:\n${issues}`);
  }

  const config = result.data;

  // Validate threshold references point to defined prog points
  if (config.progPoints && config.progPartyThreshold) {
    const ids = config.progPoints.map((p) => p.id);
    if (!ids.includes(config.progPartyThreshold)) {
      throw new Error(
        `progPartyThreshold '${config.progPartyThreshold}' does not match any prog point id`,
      );
    }
  }
  if (config.progPoints && config.clearPartyThreshold) {
    const ids = config.progPoints.map((p) => p.id);
    if (!ids.includes(config.clearPartyThreshold)) {
      throw new Error(
        `clearPartyThreshold '${config.clearPartyThreshold}' does not match any prog point id`,
      );
    }
  }

  return config;
}
