import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditReviewerCommand } from './edit-reviewer.command.js';

@CommandHandler(EditReviewerCommand)
export class EditReviewerCommandHandler
  implements ICommandHandler<EditReviewerCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditReviewerCommand) {
    try {
      const scope = Sentry.getCurrentScope();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const reviewerRole = interaction.options.getRole('reviewer-role', true);

      // Add command-specific context
      scope.setContext('reviewer_update', {
        roleId: reviewerRole.id,
        roleName: reviewerRole.name,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        reviewerRole: reviewerRole.id,
      });

      await interaction.editReply('Reviewer role updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
