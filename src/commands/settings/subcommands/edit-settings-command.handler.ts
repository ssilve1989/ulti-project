import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  ChatInputCommandInteraction,
  CommandInteractionOptionResolver,
} from 'discord.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { sentryReport } from '../../../sentry/sentry.consts.js';
import { EditSettingsCommand } from './edit-settings.command.js';

@CommandHandler(EditSettingsCommand)
class EditSettingsCommandHandler
  implements ICommandHandler<EditSettingsCommand>
{
  private readonly logger = new Logger(EditSettingsCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute({ interaction }: EditSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;

    try {
      const { signupChannel, reviewChannel, reviewerRole, ...rest } =
        this.getInteractionOptions(interaction.options);

      await this.settingsCollection.upsertSettings(guildId, {
        signupChannel: signupChannel?.id,
        reviewChannel: reviewChannel?.id,
        reviewerRole: reviewerRole?.id,
        ...rest,
      });

      await interaction.editReply('Settings updated!');
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private handleError(e: unknown, interaction: ChatInputCommandInteraction) {
    sentryReport(e, {
      userId: interaction.user.id,
      extra: {
        command: interaction.command?.name,
      },
    });

    this.logger.error(e);
    return interaction.editReply('Something went wrong!');
  }

  private getInteractionOptions(
    options: Omit<
      CommandInteractionOptionResolver<'cached' | 'raw'>,
      'getMessage' | 'getFocused'
    >,
  ) {
    const reviewerRole = options.getRole('reviewer-role');
    const reviewChannel = options.getChannel('signup-review-channel');
    const signupChannel = options.getChannel('signup-public-channel');
    const spreadsheetId = options.getString('spreadsheet-id') ?? undefined;

    const progRoles: Record<string, string | undefined> = {};

    for (const encounter in Encounter) {
      const role = options.getRole(`${encounter.toLowerCase()}-prog-role`);
      if (role) {
        progRoles[encounter] = role.id;
      }
    }

    return {
      reviewerRole,
      reviewChannel,
      signupChannel,
      spreadsheetId,
      progRoles,
    };
  }
}

export { EditSettingsCommandHandler };
