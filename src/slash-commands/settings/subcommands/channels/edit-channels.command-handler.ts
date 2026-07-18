import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

interface ChannelsOptions {
  reviewChannelId: string | undefined;
  signupChannelId: string | undefined;
  autoModChannelId: string | undefined;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'channels' })
class EditChannelsCommandHandler extends SettingsEditCommandHandler<ChannelsOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): ChannelsOptions {
    return {
      reviewChannelId: interaction.options.getChannel('signup-review-channel')
        ?.id,
      signupChannelId: interaction.options.getChannel('signup-public-channel')
        ?.id,
      autoModChannelId:
        interaction.options.getChannel('moderation-channel')?.id,
    };
  }

  protected scopeContext({
    reviewChannelId,
    signupChannelId,
    autoModChannelId,
  }: ChannelsOptions) {
    return {
      name: 'channel_update',
      context: {
        hasReviewChannel: !!reviewChannelId,
        hasSignupChannel: !!signupChannelId,
        hasAutoModChannel: !!autoModChannelId,
      },
    };
  }

  protected buildPatch({
    reviewChannelId,
    signupChannelId,
    autoModChannelId,
  }: ChannelsOptions) {
    return {
      reviewChannel: reviewChannelId,
      signupChannel: signupChannelId,
      autoModChannelId,
    };
  }

  protected successMessage(): string {
    return 'Channel settings updated!';
  }
}

export { EditChannelsCommandHandler };
