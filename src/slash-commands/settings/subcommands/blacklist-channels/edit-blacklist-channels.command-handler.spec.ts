import { Test } from '@nestjs/testing';
import type {
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { createAutoMock } from '../../../../test-utils/mock-factory.js';
import { BLACKLIST_CHANNELS_SELECT_ID } from './blacklist-channels.components.js';
import { EditBlacklistChannelsCommandHandler } from './edit-blacklist-channels.command-handler.js';

type ReplyPayload = {
  content?: string;
  components: {
    toJSON: () => { components: { default_values?: unknown[] }[] };
  }[];
};

describe('EditBlacklistChannelsCommandHandler', () => {
  let handler: EditBlacklistChannelsCommandHandler;
  let settingsCollection: Mocked<SettingsCollection>;
  let errorService: Mocked<ErrorService>;

  function createInteraction() {
    const interaction = createAutoMock() as unknown as Mocked<
      ChatInputCommandInteraction<'cached'>
    >;
    const collector = createAutoMock();
    const callbacks: {
      collect?: (i: unknown) => Promise<void>;
      end?: () => Promise<void>;
    } = {};

    collector.on.mockImplementation((event: string, cb: never) => {
      if (event === 'collect') callbacks.collect = cb;
      if (event === 'end') callbacks.end = cb;
      return collector;
    });

    const replyMessage = createAutoMock();
    replyMessage.createMessageComponentCollector.mockReturnValue(collector);

    vi.mocked(interaction.editReply).mockResolvedValue(replyMessage as never);
    Object.assign(interaction, {
      guildId: 'guild-1',
      user: { id: 'user123' },
    });

    return { interaction, replyMessage, callbacks };
  }

  function createSelectInteraction(customId: string, values: string[]) {
    const select =
      createAutoMock() as unknown as Mocked<ChannelSelectMenuInteraction>;
    select.customId = customId;
    select.values = values;
    select.isChannelSelectMenu.mockReturnValue(true);
    return select;
  }

  function lastReplyPayload(mock: { mock: { calls: unknown[][] } }) {
    return mock.mock.calls.at(-1)?.[0] as ReplyPayload;
  }

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditBlacklistChannelsCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(EditBlacklistChannelsCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('renders the select menu pre-filled with the configured channel list', async () => {
    const { interaction } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['chan-1', 'chan-2'],
    });

    await handler.execute(interaction);

    const { components } = lastReplyPayload(vi.mocked(interaction.editReply));
    expect(components[0].toJSON().components[0].default_values).toHaveLength(2);
  });

  it('falls back to the auto-mod channel for the initial selection', async () => {
    const { interaction } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      autoModChannelId: 'automod-chan',
    });

    await handler.execute(interaction);

    const { components } = lastReplyPayload(vi.mocked(interaction.editReply));
    expect(components[0].toJSON().components[0].default_values).toEqual([
      { id: 'automod-chan', type: 'channel' },
    ]);
  });

  it('replaces the stored list with the submitted selection', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(interaction);

    const select = createSelectInteraction(BLACKLIST_CHANNELS_SELECT_ID, [
      'chan-1',
      'chan-2',
    ]);
    await callbacks.collect?.(select);

    expect(select.deferUpdate).toHaveBeenCalled();
    expect(settingsCollection.upsert).toHaveBeenCalledWith('guild-1', {
      blacklistChannelIds: ['chan-1', 'chan-2'],
    });

    const { content } = lastReplyPayload(vi.mocked(select.editReply));
    expect(content).toContain('<#chan-1>');
    expect(content).toContain('<#chan-2>');
  });

  it('saves an empty selection to disable notifications', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce({
      blacklistChannelIds: ['chan-1'],
    });

    await handler.execute(interaction);

    const select = createSelectInteraction(BLACKLIST_CHANNELS_SELECT_ID, []);
    await callbacks.collect?.(select);

    expect(settingsCollection.upsert).toHaveBeenCalledWith('guild-1', {
      blacklistChannelIds: [],
    });

    const { content } = lastReplyPayload(vi.mocked(select.editReply));
    expect(content).toContain('disabled');
  });

  it('ignores interactions from other components', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(interaction);

    const select = createSelectInteraction('someOtherComponent', ['chan-1']);
    await callbacks.collect?.(select);

    expect(settingsCollection.upsert).not.toHaveBeenCalled();
    expect(select.editReply).not.toHaveBeenCalled();
  });

  it('removes the components when the collector ends', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(interaction);
    await callbacks.end?.();

    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content:
        'This menu has expired. Run /settings blacklist-channels again if needed.',
      components: [],
    });
  });

  it('captures component interaction errors instead of rejecting', async () => {
    const { interaction, callbacks } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(interaction);

    const select = createSelectInteraction(BLACKLIST_CHANNELS_SELECT_ID, [
      'chan-1',
    ]);
    vi.mocked(select.deferUpdate).mockRejectedValueOnce(
      new Error('Unknown interaction'),
    );

    // an unhandled rejection here would crash the bot via the
    // process-level unhandledRejection handler in main.ts
    await expect(callbacks.collect?.(select)).resolves.toBeUndefined();
    expect(errorService.captureError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('routes command errors through the error service', async () => {
    const { interaction } = createInteraction();
    const error = new Error('firestore down');
    settingsCollection.getSettings.mockRejectedValueOnce(error);

    await handler.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
  });

  it('creates the collector scoped to the invoking user with a timeout', async () => {
    const { interaction, replyMessage } = createInteraction();
    settingsCollection.getSettings.mockResolvedValueOnce(undefined);

    await handler.execute(interaction);

    expect(replyMessage.createMessageComponentCollector).toHaveBeenCalledWith({
      filter: expect.any(Function),
      time: 300000,
    });
  });
});
