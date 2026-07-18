import { Inject } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../error/error.service.js';
import { SettingsCollection } from '../../firebase/collections/settings-collection.js';
import type { ISlashCommand } from '../slash-command.interface.js';

export abstract class SettingsSubcommandHandler implements ISlashCommand {
  @Inject() protected readonly errorService!: ErrorService;
  @Inject() protected readonly settingsCollection!: SettingsCollection;

  protected abstract handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void>;

  /**
   * Extra fields merged into the failure reply, e.g. `{ components: [] }`
   * to clear an interactive component on error. Defaults to nothing extra.
   */
  protected errorReplyExtras(): Record<string, unknown> {
    return {};
  }

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.handle(interaction);
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({
        embeds: [errorEmbed],
        ...this.errorReplyExtras(),
      });
    }
  }
}
