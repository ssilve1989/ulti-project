import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

interface ReviewerOptions {
  role: Role;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'reviewer' })
class EditReviewerCommandHandler extends SettingsEditCommandHandler<ReviewerOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): ReviewerOptions {
    return { role: interaction.options.getRole('reviewer-role', true) };
  }

  protected scopeContext({ role }: ReviewerOptions) {
    return {
      name: 'reviewer_update',
      context: { roleId: role.id, roleName: role.name },
    };
  }

  protected buildPatch({ role }: ReviewerOptions) {
    return { reviewerRole: role.id };
  }

  protected successMessage(): string {
    return 'Reviewer role updated!';
  }
}

export { EditReviewerCommandHandler };
