import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { SLASH_COMMANDS_TOKEN } from '../slash-commands.provider.js';
import { SlashCommandsSharedModule } from './slash-commands-shared.module.js';

describe('SlashCommandsSharedModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [SlashCommandsSharedModule],
    }).compile();
  });

  test('should provide slash commands token', () => {
    const slashCommands = module.get(SLASH_COMMANDS_TOKEN);
    expect(slashCommands).toBeDefined();
    expect(Array.isArray(slashCommands)).toBe(true);
  });

  test('should export slash commands provider', () => {
    expect(() => module.get(SLASH_COMMANDS_TOKEN)).not.toThrow();
  });
});
