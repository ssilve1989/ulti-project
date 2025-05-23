import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditReviewerCommand } from './edit-reviewer.command.js';

@CommandHandler(EditReviewerCommand)
export class EditReviewerCommandHandler
  implements ICommandHandler<EditReviewerCommand>
{
  private readonly logger = new Logger(EditReviewerCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditReviewerCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const reviewerRole = interaction.options.getRole('reviewer-role', true);

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        reviewerRole: reviewerRole.id,
      });

      await interaction.editReply('Reviewer role updated!');
    } catch (e: unknown) {
      sentryReport(e);
      this.logger.error(e);
      return interaction.editReply('Something went wrong!');
    }
  }
}
