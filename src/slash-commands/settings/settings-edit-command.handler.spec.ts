import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { SettingsEditCommandHandler } from './settings-edit-command.handler.js';

interface TestOpts {
  value: string;
}

@Injectable()
class TestEditHandler extends SettingsEditCommandHandler<TestOpts> {
  readOptionsImpl = vi.fn<() => TestOpts>().mockReturnValue({
    value: 'from-options',
  });
  scopeContextImpl = vi.fn((opts: TestOpts) => ({
    name: 'test_update',
    context: { value: opts.value },
  }));
  buildPatchImpl = vi.fn(
    (opts: TestOpts, existing: SettingsDocument | undefined) => ({
      spreadsheetId: `${existing?.spreadsheetId ?? ''}${opts.value}`,
    }),
  );
  successMessageImpl = vi.fn((opts: TestOpts) => `updated: ${opts.value}`);

  protected readOptions(): TestOpts {
    return this.readOptionsImpl();
  }

  protected scopeContext(opts: TestOpts) {
    return this.scopeContextImpl(opts);
  }

  protected buildPatch(opts: TestOpts, existing: SettingsDocument | undefined) {
    return this.buildPatchImpl(opts, existing);
  }

  protected successMessage(opts: TestOpts): string {
    return this.successMessageImpl(opts);
  }
}

describe('SettingsEditCommandHandler', () => {
  let handler: TestEditHandler;
  let settingsCollection: Mocked<SettingsCollection>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TestEditHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TestEditHandler);
    settingsCollection = fixture.get(SettingsCollection);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('merges existing settings with buildPatch() and upserts', async () => {
    const guildId = 'guild-1';
    settingsCollection.getSettings.mockResolvedValueOnce({
      spreadsheetId: 'existing-',
      reviewChannel: 'chan-1',
    });

    const interaction = {
      guildId,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(settingsCollection.upsert).toHaveBeenCalledWith(guildId, {
      spreadsheetId: 'existing-from-options',
      reviewChannel: 'chan-1',
    });
  });

  it('calls readOptions -> scopeContext -> buildPatch -> successMessage with consistent opts', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce({
      spreadsheetId: 'existing-',
    });

    const interaction = {
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    const opts = { value: 'from-options' };
    expect(handler.scopeContextImpl).toHaveBeenCalledWith(opts);
    expect(handler.buildPatchImpl).toHaveBeenCalledWith(opts, {
      spreadsheetId: 'existing-',
    });
    expect(handler.successMessageImpl).toHaveBeenCalledWith(opts);
  });

  it('replies with successMessage() after upserting', async () => {
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    const interaction = {
      guildId: 'guild-1',
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith('updated: from-options');
  });
});
