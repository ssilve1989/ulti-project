import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { PartyStatus } from '../../firebase/models/signup.model.js';

const YAML_SCHEMA_HEADER =
  '# yaml-language-server: $schema=./encounter.schema.yaml';

const EncounterYamlProgPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  partyStatus: z.enum(
    Object.values(PartyStatus) as [PartyStatus, ...PartyStatus[]],
  ),
  active: z.boolean(),
});

export const EncounterYamlConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Z_]+$/, 'id must be uppercase letters and underscores only'),
  name: z.string().min(1),
  description: z.string().min(1),
  mode: z.enum(['legacy', 'ultimate', 'savage']).optional(),
  active: z.boolean(),
  emoji: z.string().optional(),
  fflogsEncounterIds: z.array(z.number().int().positive()).optional(),
  progPoints: z.array(EncounterYamlProgPointSchema).optional(),
  progPartyThreshold: z.string().optional(),
  clearPartyThreshold: z.string().optional(),
});

export type EncounterYamlConfig = z.infer<typeof EncounterYamlConfigSchema>;

export function readEncounterYaml(filePath: string): EncounterYamlConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = Bun.YAML.parse(raw);

  const result = EncounterYamlConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid encounter YAML:\n${issues}`);
  }

  return result.data;
}

export function writeEncounterYaml(
  dirPath: string,
  config: EncounterYamlConfig,
): void {
  mkdirSync(dirPath, { recursive: true });
  const filePath = join(dirPath, `${config.id}.yaml`);
  const content = Bun.YAML.stringify(config, null, 2);
  const withHeader = `${YAML_SCHEMA_HEADER}\n\n${content}\n`;
  writeFileSync(filePath, withHeader);
}
