import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'reviewer' })
class EditReviewerCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const reviewerRole = interaction.options.getRole('reviewer-role', true);

    // Add command-specific context
    scope.setContext('reviewer_update', {
      roleId: reviewerRole.id,
      roleName: reviewerRole.name,
    });

    await this.settingsCollection.upsert(interaction.guildId, {
      reviewerRole: reviewerRole.id,
    });

    await interaction.editReply('Reviewer role updated!');
  }
}

export { EditReviewerCommandHandler };
