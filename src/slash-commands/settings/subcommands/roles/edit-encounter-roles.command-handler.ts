import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditEncounterRolesCommand } from './edit-encounter-roles.command.js';

@CommandHandler(EditEncounterRolesCommand)
export class EditEncounterRolesCommandHandler
  implements ICommandHandler<EditEncounterRolesCommand>
{
  private readonly logger = new Logger(EditEncounterRolesCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditEncounterRolesCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const encounter = interaction.options.getString('encounter', true);
      const progRole = interaction.options.getRole('prog-role', true);
      const clearRole = interaction.options.getRole('clear-role', true);

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        progRoles: {
          ...settings?.progRoles,
          [encounter]: progRole.id,
        },
        clearRoles: {
          ...settings?.clearRoles,
          [encounter]: clearRole.id,
        },
      });

      await interaction.editReply('Encounter roles updated!');
    } catch (e: unknown) {
      sentryReport(e);
      this.logger.error(e);
      return interaction.editReply('Something went wrong!');
    }
  }
}
