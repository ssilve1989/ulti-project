import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { ViewSettingsCommandHandler } from './view-settings.command-handler.js';

describe('View Settings Command Handler', () => {
  let handler: ViewSettingsCommandHandler;
  let settingsCollection: any;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ViewSettingsCommandHandler],
    })
      .useMocker((token) => {
        if (typeof token === 'function') {
          const mockValue = vi.fn();
          const proto = token.prototype;
          if (proto) {
            Object.getOwnPropertyNames(proto).forEach(key => {
              if (key !== 'constructor') {
                mockValue[key] = vi.fn();
              }
            });
          }
          return mockValue;
        }
        return {};
      })
      .compile();

    handler = fixture.get(ViewSettingsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should reply with the configured settings', async () => {
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      guildId: 'test-guild',
    } as any;

    settingsCollection.getSettings.mockResolvedValueOnce({
      reviewChannel: '12345',
      reviewerRole: '67890',
      signupChannel: '09876',
      progRoles: {},
    });

    await handler.execute({ interaction });

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});
