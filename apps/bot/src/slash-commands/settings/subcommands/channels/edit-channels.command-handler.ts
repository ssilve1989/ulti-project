import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '#src/firebase/collections/settings-collection.js';
import { SettingsSlashCommand } from '#src/slash-commands/settings/settings.slash-command.js';
import { SlashCommand } from '#src/slash-commands/slash-command.decorator.js';
import type { ISlashCommand } from '#src/slash-commands/slash-command.interface.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'channels' })
class EditChannelsCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reviewChannel = interaction.options.getChannel(
      'signup-review-channel',
    );
    const signupChannel = interaction.options.getChannel(
      'signup-public-channel',
    );
    const autoModChannelId =
      interaction.options.getChannel('moderation-channel');

    // Add command-specific context
    scope.setContext('channel_update', {
      hasReviewChannel: !!reviewChannel,
      hasSignupChannel: !!signupChannel,
      hasAutoModChannel: !!autoModChannelId,
    });

    await this.settingsCollection.upsert(interaction.guildId, {
      reviewChannel: reviewChannel?.id,
      signupChannel: signupChannel?.id,
      autoModChannelId: autoModChannelId?.id,
    });

    await interaction.editReply('Channel settings updated!');
  }
}

export { EditChannelsCommandHandler };
