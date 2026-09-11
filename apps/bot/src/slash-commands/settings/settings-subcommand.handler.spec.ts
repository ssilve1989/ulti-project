import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { ErrorService } from '../../error/error.service.js';
import { createAutoMock } from '../../test-utils/mock-factory.js';
import { SettingsSubcommandHandler } from './settings-subcommand.handler.js';

@Injectable()
class TestHandler extends SettingsSubcommandHandler {
  handleImpl = vi.fn().mockResolvedValue(undefined);
  extrasImpl = vi.fn().mockReturnValue({});

  protected handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    return this.handleImpl(interaction);
  }

  protected override errorReplyExtras(): Record<string, unknown> {
    return this.extrasImpl();
  }
}

describe('SettingsSubcommandHandler', () => {
  let handler: TestHandler;
  let errorService: Mocked<ErrorService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TestHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TestHandler);
    errorService = fixture.get(ErrorService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('defers the reply before delegating to handle()', async () => {
    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(handler.handleImpl).toHaveBeenCalledWith(interaction);
  });

  it('replies with an error embed when handle() throws', async () => {
    const error = new Error('boom');
    const mockErrorEmbed = {} as EmbedBuilder;
    handler.handleImpl.mockRejectedValueOnce(error);
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(errorService.handleCommandError).toHaveBeenCalledWith(
      error,
      interaction,
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
    });
  });

  it('merges errorReplyExtras() into the failure reply', async () => {
    const error = new Error('boom');
    const mockErrorEmbed = {} as EmbedBuilder;
    handler.handleImpl.mockRejectedValueOnce(error);
    handler.extrasImpl.mockReturnValue({ components: [] });
    errorService.handleCommandError.mockReturnValue(mockErrorEmbed);

    const interaction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn(),
    } as unknown as ChatInputCommandInteraction<'cached'>;

    await handler.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [mockErrorEmbed],
      components: [],
    });
  });
});
